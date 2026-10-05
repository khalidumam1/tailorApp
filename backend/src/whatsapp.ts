import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type Customer, type WhatsAppNotificationKind } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { normalizePakistanPhone, toE164Phone } from '@tailor/shared';
import { env } from './config.js';
import { prisma } from './db.js';
import type { Logger } from 'pino';
import {
  isNotificationTemplate,
  isNotificationTemplateMap,
  renderNotificationTemplate,
  type NotificationTemplateVariable,
} from './domain/notification-templates.js';

type NotificationTx = Prisma.TransactionClient;
type NotificationSnapshot = Record<string, string>;
type NotificationPayload = Record<string, Prisma.InputJsonValue>;

function jsonInput(value: NotificationPayload): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function money(value: Prisma.Decimal | string): string {
  return `PKR ${new Prisma.Decimal(value).toFixed(2)}`;
}

function dateLabel(value: Date): string {
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeZone: 'Asia/Karachi',
  }).format(value);
}

function templateFor(kind: WhatsAppNotificationKind): string {
  if (kind === 'ORDER_CREATED') return env.WHATSAPP_ORDER_TEMPLATE;
  if (kind === 'PAYMENT_RECEIVED') return env.WHATSAPP_PAYMENT_TEMPLATE;
  return env.WHATSAPP_READY_TEMPLATE;
}

function validatedPhone(phone: string): string | null {
  try {
    return toE164Phone(phone);
  } catch {
    return null;
  }
}

async function queueNotification(
  tx: NotificationTx,
  input: {
    businessId: string;
    customer: Pick<Customer, 'id' | 'phone' | 'whatsappConsent' | 'whatsappOptedOutAt'>;
    orderId: string;
    paymentId?: string;
    kind: WhatsAppNotificationKind;
    idempotencyKey: string;
    payload: NotificationSnapshot;
  },
): Promise<void> {
  const phone = validatedPhone(input.customer.phone);
  let notSentReason = !phone
    ? 'Customer phone number is invalid'
    : input.customer.whatsappOptedOutAt || !input.customer.whatsappConsent
      ? 'Customer has not consented or has opted out'
      : null;
  let templateName = templateFor(input.kind);
  let payload: NotificationPayload = input.payload;
  const configuration = await tx.businessConfiguration.findUnique({
    where: { businessId: input.businessId },
    select: { notificationTemplates: true },
  });
  const templates = isNotificationTemplateMap(configuration?.notificationTemplates)
    ? configuration.notificationTemplates
    : {};
  if (Object.hasOwn(templates, input.kind)) {
    const configured = templates[input.kind];
    if (!isNotificationTemplate(configured)) {
      notSentReason ??= 'Notification template configuration is invalid';
    } else if (!configured.enabled) {
      notSentReason ??= 'Notification event is disabled by business configuration';
    } else {
      try {
        const values: Record<NotificationTemplateVariable, string> = {
          'business.name': input.payload.businessName ?? '',
          'business.phone': input.payload.businessPhone ?? '',
          'customer.name': input.payload.customerName ?? '',
          'customer.phone': phone ?? '',
          'order.number': input.payload.orderNumber ?? '',
          'order.total': input.payload.total ?? '',
          'order.paid': input.payload.totalPaid ?? input.payload.advancePaid ?? '',
          'order.balance': input.payload.remaining ?? input.payload.outstanding ?? '',
          'order.status': input.payload.orderStatus ?? '',
          'order.readyDate': input.payload.readyDate ?? '',
          'item.name': input.payload.itemName ?? input.payload.garments ?? '',
        };
        const rendered = renderNotificationTemplate(configured.body, values);
        templateName = configured.providerTemplateName ?? templateName;
        payload = {
          ...input.payload,
          renderedBody: rendered.body,
          templateParameters: rendered.parameters,
          templateLanguage: configured.language ?? env.WHATSAPP_TEMPLATE_LANGUAGE,
        };
      } catch (error) {
        notSentReason ??= error instanceof Error ? error.message.slice(0, 500) : 'Notification template is invalid';
      }
    }
  }
  const now = new Date();

  await tx.whatsAppNotification.createMany({
    data: [{
      businessId: input.businessId,
      customerId: input.customer.id,
      orderId: input.orderId,
      paymentId: input.paymentId,
      kind: input.kind,
      status: notSentReason ? 'NOT_SENT' : 'QUEUED',
      idempotencyKey: input.idempotencyKey,
      recipientPhone: phone ?? '',
      templateName,
      payload: jsonInput(payload),
      lastError: notSentReason,
      updatedAt: now,
      ...(notSentReason ? { failedAt: now } : {}),
    }],
    skipDuplicates: true,
  });
}

export async function queueOrderCreated(
  tx: NotificationTx,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      business: { select: { name: true } },
      customer: true,
      items: true,
      payments: { select: { kind: true, amount: true } },
    },
  });
  const paid = order.payments.reduce(
    (total, payment) => payment.kind === 'PAYMENT' ? total.plus(payment.amount) : total.minus(payment.amount),
    new Prisma.Decimal(0),
  );
  const garments = order.items.map((item) => `${item.quantity} x ${item.garmentName}`).join(', ');
  await queueNotification(tx, {
    businessId: order.businessId,
    customer: order.customer,
    orderId: order.id,
    kind: 'ORDER_CREATED',
    idempotencyKey: `order-created:${order.id}`,
    payload: {
      businessName: order.business.name,
      customerName: order.customer.name,
      orderNumber: order.orderNumber,
      garments,
      total: money(order.total),
      advancePaid: money(paid),
      outstanding: money(Prisma.Decimal.max(new Prisma.Decimal(0), order.total.minus(paid))),
      readyDate: dateLabel(order.promisedAt),
      orderStatus: order.status,
      itemName: order.items[0]?.itemName ?? order.items[0]?.garmentName ?? '',
    },
  });
}

export async function queuePaymentReceived(
  tx: NotificationTx,
  paymentId: string,
): Promise<void> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      business: { select: { name: true } },
      order: { include: { customer: true, items: true } },
    },
  });
  if (payment.kind !== 'PAYMENT') return;
  const totals = await tx.payment.groupBy({
    by: ['kind'],
    where: { businessId: payment.businessId, orderId: payment.orderId },
    _sum: { amount: true },
  });
  const paid = totals.reduce((total, row) => {
    const amount = row._sum.amount ?? new Prisma.Decimal(0);
    return row.kind === 'PAYMENT' ? total.plus(amount) : total.minus(amount);
  }, new Prisma.Decimal(0));

  await queueNotification(tx, {
    businessId: payment.businessId,
    customer: payment.order.customer,
    orderId: payment.orderId,
    paymentId: payment.id,
    kind: 'PAYMENT_RECEIVED',
    idempotencyKey: `payment-received:${payment.id}`,
    payload: {
      businessName: payment.business.name,
      customerName: payment.order.customer.name,
      orderNumber: payment.order.orderNumber,
      amount: money(payment.amount),
      totalPaid: money(paid),
      remaining: money(Prisma.Decimal.max(new Prisma.Decimal(0), payment.order.total.minus(paid))),
      receiptReference: payment.receiptNumber,
      paymentMethod: payment.method,
      paymentKind: payment.kind,
      paidAt: dateLabel(payment.createdAt),
      total: money(payment.order.total),
      orderStatus: payment.order.status,
      itemName: payment.order.items[0]?.itemName ?? payment.order.items[0]?.garmentName ?? '',
    },
  });
}

export async function queueOrderReady(
  tx: NotificationTx,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      business: { select: { name: true } },
      customer: true,
      items: true,
      payments: { select: { kind: true, amount: true } },
    },
  });
  const paid = order.payments.reduce(
    (total, payment) => payment.kind === 'PAYMENT' ? total.plus(payment.amount) : total.minus(payment.amount),
    new Prisma.Decimal(0),
  );
  await queueNotification(tx, {
    businessId: order.businessId,
    customer: order.customer,
    orderId: order.id,
    kind: 'ORDER_READY',
    idempotencyKey: `order-ready:${order.id}`,
    payload: {
      businessName: order.business.name,
      customerName: order.customer.name,
      orderNumber: order.orderNumber,
      garments: order.items.map((item) => `${item.quantity} x ${item.garmentName}`).join(', '),
      total: money(order.total),
      totalPaid: money(paid),
      remaining: money(Prisma.Decimal.max(new Prisma.Decimal(0), order.total.minus(paid))),
      readyDate: dateLabel(new Date()),
      orderStatus: order.status,
      itemName: order.items[0]?.itemName ?? order.items[0]?.garmentName ?? '',
    },
  });
}

function objectValue(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Notification payload is invalid');
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
}

export async function generateReceiptPdf(
  payload: Prisma.JsonValue,
  kind: WhatsAppNotificationKind,
): Promise<Buffer> {
  const values = objectValue(payload);
  const document = new PDFDocument({ size: 'A4', margin: 52, info: { Title: 'Business Receipt', Author: values.businessName ?? 'Business' } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  document.fontSize(21).fillColor('#17324d').text(values.businessName ?? 'Business');
  document.moveDown(0.3).fontSize(10).fillColor('#68788a').text('CUSTOMER RECEIPT');
  document.moveDown(1).fontSize(12).fillColor('#17202a');
  document.text(`Customer: ${values.customerName ?? 'Customer'}`);
  document.text(`Order: ${values.orderNumber ?? '-'}`);
  document.text(`Date: ${values.paidAt ?? values.readyDate ?? dateLabel(new Date())}`);
  document.moveDown(0.8).fontSize(10).fillColor('#52616f').text(`Items: ${values.itemName ?? values.garments ?? '-'}`);
  document.moveDown(0.6).fillColor('#17202a');

  if (kind === 'PAYMENT_RECEIVED') {
    document.text(`${values.paymentKind === 'REVERSAL' ? 'Payment reversal' : 'Payment received'}: ${values.amount ?? '-'}`);
    document.text(`Method: ${values.paymentMethod ?? '-'}`);
    document.text(`Receipt reference: ${values.receiptReference ?? '-'}`);
    if (values.correctionOfReceipt) document.text(`Correction of: ${values.correctionOfReceipt}`);
    document.moveDown(0.5);
    document.text(`Order total: ${values.total ?? '-'}`);
    document.text(`Total paid: ${values.totalPaid ?? '-'}`);
    document.text(`Remaining balance: ${values.remaining ?? '-'}`);
  } else {
    document.text(`Order total: ${values.total ?? '-'}`);
    document.text(`Advance paid: ${values.advancePaid ?? values.totalPaid ?? 'PKR 0.00'}`);
    document.text(`Outstanding balance: ${values.outstanding ?? values.remaining ?? '-'}`);
    document.text(`Expected ready date: ${values.readyDate ?? '-'}`);
  }
  document.moveDown(2).fontSize(9).fillColor('#68788a')
    .text('Thank you for choosing us. Please keep this receipt for your records.');
  document.end();
  return output;
}

export async function generateSubscriptionReceiptPdf(input: {
  businessName: string;
  planName: string;
  cycle: string;
  amount: string;
  transactionReference: string;
  senderName: string;
  paymentMethod: string;
  paymentDate: string;
  invoiceNumber: string;
  startsAt: string;
  endsAt: string;
}): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: 52,
    info: { Title: `Subscription receipt ${input.invoiceNumber}`, Author: input.businessName },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.fontSize(22).fillColor('#17324d').text('TailorApp');
  document.moveDown(0.25).fontSize(11).fillColor('#68788a').text('SUBSCRIPTION PAYMENT RECEIPT');
  document.moveDown(1).fontSize(12).fillColor('#17202a').text(input.businessName);
  document.moveDown(0.5).fontSize(10).fillColor('#52616f');
  document.text(`Receipt: ${input.invoiceNumber}`);
  document.text(`Payment date: ${input.paymentDate}`);
  document.text(`Plan: ${input.planName} (${input.cycle.toLowerCase()})`);
  document.text(`Subscription period: ${input.startsAt} to ${input.endsAt}`);
  document.moveDown(0.8).fontSize(12).fillColor('#17202a').text(`Amount recorded: PKR ${input.amount}`);
  document.moveDown(0.4).fontSize(10).fillColor('#52616f');
  document.text(`Payment method: ${input.paymentMethod}`);
  document.text(`Transaction reference: ${input.transactionReference}`);
  document.text(`Sender name: ${input.senderName}`);
  document.moveDown(2).fontSize(9).fillColor('#68788a')
    .text('This receipt confirms the subscription payment recorded by TailorApp. It does not represent an external bank or wallet refund.');
  document.end();
  return output;
}

type MetaResponse = { messages?: Array<{ id?: string }> };

export async function metaPost<T>(
  url: string,
  body: BodyInit,
  contentType?: string,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };
  if (contentType) headers['content-type'] = contentType;
  const response = await fetcher(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Meta API rejected request (HTTP ${response.status})`);
  return await response.json() as T;
}

async function uploadReceipt(payload: Prisma.JsonValue, kind: WhatsAppNotificationKind): Promise<string> {
  const receipt = await generateReceiptPdf(payload, kind);
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', 'application/pdf');
  const fileBuffer = new ArrayBuffer(receipt.byteLength);
  new Uint8Array(fileBuffer).set(receipt);
  form.set('file', new Blob([fileBuffer], { type: 'application/pdf' }), 'receipt.pdf');
  const result = await metaPost<{ id?: string }>(
    `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`,
    form,
  );
  if (!result.id) throw new Error('Meta media upload did not return a media ID');
  return result.id;
}

async function sendNotification(
  notification: {
    id: string;
    kind: WhatsAppNotificationKind;
    templateName: string;
    recipientPhone: string;
    payload: Prisma.JsonValue;
  },
): Promise<string> {
  const payload = objectValue(notification.payload);
  const legacyParameters = notification.kind === 'ORDER_CREATED'
    ? ['orderNumber', 'garments', 'total', 'advancePaid', 'outstanding', 'readyDate']
    : notification.kind === 'PAYMENT_RECEIVED'
      ? ['orderNumber', 'amount', 'totalPaid', 'remaining', 'receiptReference']
      : ['orderNumber', 'readyDate'];
  const rawPayload = notification.payload;
  const configuredParameters = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload.templateParameters
    : undefined;
  const parameters = Array.isArray(configuredParameters)
    && configuredParameters.every((value): value is string => typeof value === 'string')
    ? configuredParameters.map((_, index) => `configured_${index}`)
    : legacyParameters;
  const parameterValues = Array.isArray(configuredParameters)
    && configuredParameters.every((value): value is string => typeof value === 'string')
    ? configuredParameters
    : parameters.map((key) => payload[key] ?? '');
  const components: Array<Record<string, unknown>> = [];
  if (notification.kind !== 'ORDER_READY') {
    const mediaId = await uploadReceipt(notification.payload, notification.kind);
    components.push({
      type: 'header',
      parameters: [{ type: 'document', document: { id: mediaId, filename: 'receipt.pdf' } }],
    });
  }
  components.push({
    type: 'body',
    parameters: parameterValues.map((text) => ({ type: 'text', text })),
  });
  const templateLanguage = payload.templateLanguage ?? env.WHATSAPP_TEMPLATE_LANGUAGE;
  const result = await metaPost<MetaResponse>(
    `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: notification.recipientPhone.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: notification.templateName,
        language: { code: templateLanguage },
        components,
      },
      biz_opaque_callback_data: notification.id,
    }),
    'application/json',
  );
  const messageId = result.messages?.[0]?.id;
  if (!messageId) throw new Error('Meta API did not return a message ID');
  return messageId;
}

export async function processNextWhatsAppNotification(): Promise<boolean> {
  if (!env.WHATSAPP_ENABLED) return false;
  const now = new Date();
  const stale = new Date(now.getTime() - 5 * 60_000);
  await prisma.whatsAppNotification.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: stale } },
    data: { status: 'QUEUED', nextAttemptAt: now },
  });
  const next = await prisma.whatsAppNotification.findFirst({
    where: { status: 'QUEUED', nextAttemptAt: { lte: now } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (!next) return false;
  const claim = await prisma.whatsAppNotification.updateMany({
    where: {
      id: next.id,
      status: 'QUEUED',
      nextAttemptAt: { lte: now },
      customer: { is: { whatsappConsent: true, whatsappOptedOutAt: null, deletedAt: null } },
    },
    data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
  });
  if (!claim.count) {
    const customer = await prisma.customer.findFirst({
      where: { id: next.customerId, businessId: next.businessId },
      select: { whatsappConsent: true, whatsappOptedOutAt: true, deletedAt: true },
    });
    if (!customer || !customer.whatsappConsent || customer.whatsappOptedOutAt || customer.deletedAt) {
      await prisma.whatsAppNotification.updateMany({
        where: { id: next.id, status: 'QUEUED' },
        data: { status: 'NOT_SENT', lastError: 'Customer has not consented or has opted out', failedAt: new Date() },
      });
    }
    return true;
  }

  try {
    const current = await prisma.whatsAppNotification.findUniqueOrThrow({
      where: { id: next.id },
      select: { id: true, kind: true, templateName: true, recipientPhone: true, payload: true },
    });
    const consent = await prisma.customer.findFirst({
      where: { id: next.customerId, businessId: next.businessId, whatsappConsent: true, whatsappOptedOutAt: null, deletedAt: null },
      select: { id: true },
    });
    if (!consent) {
      await prisma.whatsAppNotification.updateMany({
        where: { id: next.id, status: 'PROCESSING' },
        data: { status: 'NOT_SENT', lastError: 'Customer has not consented or has opted out', failedAt: new Date() },
      });
      return true;
    }
    const metaMessageId = await sendNotification(current);
    await prisma.whatsAppNotification.updateMany({
      where: { id: current.id, status: 'PROCESSING' },
      data: { status: 'SENT', metaMessageId, sentAt: new Date(), lastError: null },
    });
  } catch (error) {
    const statusCode = error instanceof Error && /HTTP (\d{3})/.exec(error.message)?.[1];
    const permanentFailure = statusCode ? Number(statusCode) >= 400 && Number(statusCode) < 500 && Number(statusCode) !== 429 : false;
    const failed = permanentFailure || next.attemptCount + 1 >= 8;
    const delayMs = Math.min(6 * 60 * 60_000, 5_000 * (2 ** Math.min(next.attemptCount, 10)));
    const reason = error instanceof Error ? error.message.slice(0, 500) : 'WhatsApp delivery failed';
    await prisma.whatsAppNotification.updateMany({
      where: { id: next.id, status: 'PROCESSING' },
      data: {
        status: failed ? 'FAILED' : 'QUEUED',
        nextAttemptAt: new Date(Date.now() + delayMs),
        lastError: reason,
        ...(failed ? { failedAt: new Date() } : {}),
      },
    });
  }
  return true;
}

export function startWhatsAppWorker(logger: Logger): NodeJS.Timeout | undefined {
  if (!env.WHATSAPP_ENABLED) {
    logger.info('WhatsApp delivery worker is disabled');
    return undefined;
  }
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      for (let sent = 0; sent < 10 && await processNextWhatsAppNotification(); sent += 1) {
        // Drain a small batch, then yield to the event loop.
      }
    } catch (error) {
      logger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'WhatsApp notification worker failed');
    } finally {
      running = false;
    }
  };
  void poll();
  return setInterval(() => void poll(), 5_000);
}

export function verifyMetaSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  if (!env.META_APP_SECRET || !rawBody || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest();
  const received = Buffer.from(signature.slice(7), 'hex');
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export function verifyMetaChallengeToken(received: string | undefined): boolean {
  if (!env.WHATSAPP_VERIFY_TOKEN || !received) return false;
  const expected = Buffer.from(env.WHATSAPP_VERIFY_TOKEN);
  const candidate = Buffer.from(received);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export async function applyMetaWebhook(body: unknown): Promise<void> {
  if (!body || typeof body !== 'object') return;
  const entries = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== 'object') continue;
      const metadata = (value as { metadata?: { phone_number_id?: unknown } }).metadata;
      if (metadata?.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID) continue;
      const statuses = (value as { statuses?: unknown }).statuses;
      if (Array.isArray(statuses)) await applyDeliveryStatuses(statuses);
      const messages = (value as { messages?: unknown }).messages;
      if (Array.isArray(messages)) await applyOptOutMessages(messages);
    }
  }
}

async function applyDeliveryStatuses(statuses: unknown[]): Promise<void> {
  for (const status of statuses) {
    if (!status || typeof status !== 'object') continue;
    const event = status as {
      id?: unknown;
      status?: unknown;
      timestamp?: unknown;
      biz_opaque_callback_data?: unknown;
      errors?: Array<{ code?: unknown }>;
    };
    if (typeof event.status !== 'string') continue;
    const metaId = typeof event.id === 'string' ? event.id : undefined;
    const callbackId = typeof event.biz_opaque_callback_data === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.biz_opaque_callback_data)
      ? event.biz_opaque_callback_data
      : undefined;
    const notification = await prisma.whatsAppNotification.findFirst({
      where: {
        OR: [
          ...(metaId ? [{ metaMessageId: metaId }] : []),
          ...(callbackId ? [{ id: callbackId }] : []),
        ],
      },
      select: { id: true, status: true },
    });
    if (!notification) continue;
    const timestampSeconds = typeof event.timestamp === 'string' && /^\d{1,12}$/.test(event.timestamp)
      ? Number(event.timestamp)
      : NaN;
    const at = Number.isSafeInteger(timestampSeconds) && timestampSeconds > 0
      ? new Date(timestampSeconds * 1000)
      : new Date();
    const nextStatus = event.status.toUpperCase();
    if (nextStatus === 'SENT' && notification.status === 'PROCESSING') {
      await prisma.whatsAppNotification.update({ where: { id: notification.id }, data: { status: 'SENT', metaMessageId: metaId, sentAt: at } });
    } else if (nextStatus === 'DELIVERED' && !['DELIVERED', 'READ', 'NOT_SENT'].includes(notification.status)) {
      await prisma.whatsAppNotification.update({ where: { id: notification.id }, data: { status: 'DELIVERED', metaMessageId: metaId, deliveredAt: at, lastError: null, failedAt: null } });
    } else if (nextStatus === 'READ' && !['READ', 'NOT_SENT'].includes(notification.status)) {
      await prisma.whatsAppNotification.update({ where: { id: notification.id }, data: { status: 'READ', metaMessageId: metaId, readAt: at, lastError: null, failedAt: null } });
    } else if (nextStatus === 'FAILED' && !['FAILED', 'DELIVERED', 'READ', 'NOT_SENT'].includes(notification.status)) {
      const code = event.errors?.[0]?.code;
      await prisma.whatsAppNotification.update({
        where: { id: notification.id },
        data: {
          status: 'FAILED',
          metaMessageId: metaId,
          failedAt: at,
          lastError: typeof code === 'number' ? `Meta delivery error code ${code}` : 'Meta reported a delivery failure',
        },
      });
    }
  }
}

async function applyOptOutMessages(messages: unknown[]): Promise<void> {
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const fields = message as { from?: unknown; text?: { body?: unknown }; button?: { text?: unknown } };
    const body = typeof fields.text?.body === 'string' ? fields.text.body : fields.button?.text;
    if (typeof fields.from !== 'string' || typeof body !== 'string' || !/^(stop|unsubscribe|cancel|end|quit)$/i.test(body.trim())) continue;
    const phoneNormalized = normalizePakistanPhone(fields.from);
    const customers = await prisma.customer.findMany({
      where: { phoneNormalized, whatsappConsent: true, whatsappOptedOutAt: null },
      select: { id: true, businessId: true },
    });
    if (!customers.length) continue;
    const at = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.customer.updateMany({
        where: { id: { in: customers.map((customer) => customer.id) } },
        data: { whatsappConsent: false, whatsappOptedOutAt: at, version: { increment: 1 } },
      });
      await tx.auditEvent.createMany({
        data: customers.map((customer) => ({
          businessId: customer.businessId,
          action: 'customer.whatsapp_opted_out',
          entityType: 'customer',
          entityId: customer.id,
          metadata: { source: 'whatsapp_webhook' },
          requestId: 'meta-whatsapp-webhook',
        })),
      });
      await tx.whatsAppNotification.updateMany({
        where: { customerId: { in: customers.map((customer) => customer.id) }, status: 'QUEUED' },
        data: { status: 'NOT_SENT', lastError: 'Customer opted out', failedAt: at },
      });
    });
  }
}
