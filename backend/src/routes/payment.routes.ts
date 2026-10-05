import { Prisma } from '@prisma/client';
import express from 'express';
import {
  createPaymentSchema,
  paymentQuerySchema,
  reversePaymentSchema,
} from '@tailor/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { calculateNetPaid, calculateOutstanding } from '../domain/finance.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { generateReceiptPdf, queuePaymentReceived } from '../whatsapp.js';

const router = express.Router();
const idSchema = z.string().uuid();
const idempotencySchema = z.string().uuid();

function getContext(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function getIdempotencyKey(req: express.Request): string {
  const result = idempotencySchema.safeParse(req.header('Idempotency-Key'));
  if (!result.success) throw new HttpError(400, 'A UUID Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED');
  return result.data;
}

function samePayment(
  payment: { orderId: string; amount: Prisma.Decimal; method: string; kind: string },
  orderId: string,
  amount: Prisma.Decimal,
  method: string,
  kind = 'PAYMENT',
): boolean {
  return payment.orderId === orderId
    && payment.amount.equals(amount)
    && payment.method === method
    && payment.kind === kind;
}

function mapFinancialConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') {
      throw new HttpError(409, 'A concurrent financial change occurred; retry with the same idempotency key', 'FINANCIAL_CONFLICT');
    }
    if (error.code === 'P2002') {
      throw new HttpError(409, 'This idempotency key has already been used', 'IDEMPOTENCY_CONFLICT');
    }
  }
  throw error;
}

async function getNetPaid(
  tx: Prisma.TransactionClient,
  businessId: string,
  orderId: string,
): Promise<Prisma.Decimal> {
  const totals = await tx.payment.groupBy({
    by: ['kind'],
    where: { businessId, orderId },
    _sum: { amount: true },
  });
  return calculateNetPaid(totals.map((row) => ({
    kind: row.kind,
    amount: row._sum.amount ?? new Prisma.Decimal(0),
  })));
}

async function getReceiptNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  const business = await tx.business.update({
    where: { id: businessId },
    data: { receiptSequence: { increment: 1 } },
    select: { slug: true, receiptSequence: true },
  });
  return `${business.slug.slice(0, 8).toUpperCase()}-R${String(business.receiptSequence).padStart(6, '0')}`;
}

router.use(authenticate);

router.get('/', requireBusinessPermission('payments:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const query = paymentQuerySchema.parse(req.query);
  if (query.cursor) {
    const cursorExists = await prisma.payment.findFirst({
      where: { id: query.cursor, businessId },
      select: { id: true },
    });
    if (!cursorExists) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const items = await prisma.payment.findMany({
    where: {
      businessId,
      ...(query.from || query.to ? {
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      } : {}),
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      },
      correctionOf: { select: { receiptNumber: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = items.length > query.limit;
  const page = hasMore ? items.slice(0, query.limit) : items;
  res.json({ data: { items: page, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
}));

router.get('/customers/:customerId/ledger', requireBusinessPermission('payments:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const customerId = idSchema.parse(req.params.customerId);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  const payments = await prisma.payment.findMany({
    where: { businessId, order: { customerId } },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const netBalance = calculateNetPaid(payments);
  res.json({ data: { customer, entries: payments, netPaid: netBalance.toFixed(2) } });
}));

router.post('/orders/:orderId', requireBusinessPermission('payments:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const input = createPaymentSchema.parse(req.body);
  const key = getIdempotencyKey(req);
  const amount = new Prisma.Decimal(input.amount);

  const existing = await prisma.payment.findUnique({
    where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
  });
  if (existing) {
    if (!samePayment(existing, orderId, amount, input.method)) {
      throw new HttpError(409, 'Idempotency key was already used for a different payment', 'IDEMPOTENCY_CONFLICT');
    }
    res.json({ data: existing, replayed: true });
    return;
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, businessId, deletedAt: null, status: { not: 'CANCELLED' } },
        select: { id: true, total: true },
      });
      if (!order) throw new HttpError(404, 'Active order not found', 'ORDER_NOT_FOUND');
      const currentPaid = await getNetPaid(tx, businessId, orderId);
      if (amount.greaterThan(new Prisma.Decimal(order.total).minus(currentPaid))) {
        throw new HttpError(409, 'Payment exceeds the outstanding order balance', 'PAYMENT_EXCEEDS_BALANCE');
      }
      const receiptNumber = await getReceiptNumber(tx, businessId);
      const created = await tx.payment.create({
        data: {
          businessId,
          orderId,
          recordedById: actorId,
          amount,
          method: input.method,
          receiptNumber,
          idempotencyKey: key,
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'payment.posted',
          entityType: 'payment',
          entityId: created.id,
          metadata: { orderId, amount: amount.toFixed(2), method: input.method },
          requestId: req.requestId,
        },
      });
      await queuePaymentReceived(tx, created.id);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ data: payment });
  } catch (error) {
    mapFinancialConflict(error);
  }
}));

router.post('/:paymentId/reversals', requireBusinessPermission('payments:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const paymentId = idSchema.parse(req.params.paymentId);
  const input = reversePaymentSchema.parse(req.body);
  const key = getIdempotencyKey(req);
  const amount = new Prisma.Decimal(input.amount);

  const existing = await prisma.payment.findUnique({
    where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
  });
  if (existing) {
    if (!samePayment(existing, existing.orderId, amount, existing.method, 'REVERSAL')
    || existing.correctionOfId !== paymentId
    || existing.correctionReason !== input.reason) {
      throw new HttpError(409, 'Idempotency key was already used for a different correction', 'IDEMPOTENCY_CONFLICT');
    }
    res.json({ data: existing, replayed: true });
    return;
  }

  try {
    const reversal = await prisma.$transaction(async (tx) => {
      const original = await tx.payment.findFirst({
        where: { id: paymentId, businessId, kind: 'PAYMENT' },
        select: { id: true, orderId: true, amount: true, method: true },
      });
      if (!original) throw new HttpError(404, 'Posted payment not found', 'PAYMENT_NOT_FOUND');
      const previouslyReversed = await tx.payment.aggregate({
        where: { businessId, correctionOfId: original.id, kind: 'REVERSAL' },
        _sum: { amount: true },
      });
      const reversible = new Prisma.Decimal(original.amount).minus(previouslyReversed._sum.amount ?? 0);
      if (amount.greaterThan(reversible)) {
        throw new HttpError(409, 'Correction exceeds the unreversed payment amount', 'REVERSAL_EXCEEDS_PAYMENT');
      }
      const receiptNumber = await getReceiptNumber(tx, businessId);
      const created = await tx.payment.create({
        data: {
          businessId,
          orderId: original.orderId,
          recordedById: actorId,
          amount,
          method: original.method,
          kind: 'REVERSAL',
          correctionOfId: original.id,
          correctionReason: input.reason,
          receiptNumber,
          idempotencyKey: key,
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'payment.reversed',
          entityType: 'payment',
          entityId: created.id,
          metadata: { correctionOfId: original.id, amount: amount.toFixed(2), reason: input.reason },
          requestId: req.requestId,
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ data: reversal });
  } catch (error) {
    mapFinancialConflict(error);
  }
}));

router.get('/:paymentId/receipt', requireBusinessPermission('payments:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const paymentId = idSchema.parse(req.params.paymentId);
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, businessId },
    include: {
      business: { select: { name: true, timezone: true, currency: true } },
      order: { include: { customer: { select: { name: true, phone: true } } } },
      correctionOf: { select: { receiptNumber: true } },
    },
  });
  if (!payment) throw new HttpError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  res.json({ data: payment });
}));

router.get('/:paymentId/receipt.pdf', requireBusinessPermission('payments:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const paymentId = idSchema.parse(req.params.paymentId);
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, businessId },
    include: {
      business: { select: { name: true } },
      order: {
        include: {
          customer: { select: { name: true } },
          items: { select: { itemName: true, garmentName: true, quantity: true } },
        },
      },
      correctionOf: { select: { receiptNumber: true } },
    },
  });
  if (!payment) throw new HttpError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  const totals = await prisma.payment.groupBy({
    by: ['kind'],
    where: { businessId, orderId: payment.orderId },
    _sum: { amount: true },
  });
  const totalPaid = calculateNetPaid(totals.map((row) => ({
    kind: row.kind,
    amount: row._sum.amount ?? new Prisma.Decimal(0),
  })));
  const pdf = await generateReceiptPdf({
    businessName: payment.business.name,
    customerName: payment.order.customer.name,
    orderNumber: payment.order.orderNumber,
    garments: payment.order.items.map((item) => `${item.quantity} x ${item.itemName ?? item.garmentName}`).join(', '),
    amount: `PKR ${payment.amount.toFixed(2)}`,
    paymentMethod: payment.method,
    paymentKind: payment.kind,
    receiptReference: payment.receiptNumber,
    ...(payment.correctionOf ? { correctionOfReceipt: payment.correctionOf.receiptNumber } : {}),
    paidAt: payment.createdAt.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }),
    total: `PKR ${payment.order.total.toFixed(2)}`,
    totalPaid: `PKR ${totalPaid.toFixed(2)}`,
    remaining: `PKR ${calculateOutstanding(payment.order.total, totals.map((row) => ({
      kind: row.kind,
      amount: row._sum.amount ?? new Prisma.Decimal(0),
    }))).toFixed(2)}`,
  }, 'PAYMENT_RECEIVED');
  res.status(200)
    .type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="${payment.receiptNumber}.pdf"`)
    .send(pdf);
}));

export default router;
