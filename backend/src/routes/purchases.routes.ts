import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { assertBusinessModuleEnabled } from '../business-modules.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { ensureDefaultAccounts, postJournal, requireBusinessAccount } from '../domain/accounting.js';
import { getOrCreateDefaultLocation, postInventoryMovement } from '../domain/inventory.js';

const router = express.Router();
const uuidSchema = z.string().uuid();
const decimalSchema = (places: number) => z.string().regex(new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${places}})?$`));
const quantitySchema = decimalSchema(6).refine((value) => new Prisma.Decimal(value).greaterThan(0));
const priceSchema = decimalSchema(4);
const orderInputSchema = z.object({
  supplierId: uuidSchema,
  orderedAt: z.string().datetime({ offset: true }).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(z.object({
    variantId: uuidSchema,
    description: z.string().trim().max(240).optional(),
    quantity: quantitySchema,
    unitCost: priceSchema,
  }).strict()).min(1).max(100),
}).strict();
const receiveSchema = z.object({
  invoiceReference: z.string().trim().max(120).nullable().optional(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
  lines: z.array(z.object({
    purchaseOrderLineId: uuidSchema,
    quantity: quantitySchema,
    unitCost: priceSchema.optional(),
    locationId: uuidSchema.optional(),
  }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  if (new Set(input.lines.map((line) => line.purchaseOrderLineId)).size !== input.lines.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'Each purchase order line may appear only once per receipt' });
  }
});
const settlementSchema = z.object({
  kind: z.enum(['PAYMENT', 'REFUND']),
  financialAccountId: uuidSchema,
  amount: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/).refine((value) => new Prisma.Decimal(value).greaterThan(0)),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
}).strict();
const listSchema = z.object({
  status: z.enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(),
  supplierId: uuidSchema.optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function context(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}
function idempotencyKey(req: express.Request): string {
  const parsed = uuidSchema.safeParse(req.header('Idempotency-Key'));
  if (!parsed.success) throw new HttpError(400, 'A UUID Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED');
  return parsed.data;
}
async function audit(
  tx: Prisma.TransactionClient,
  businessId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  requestId: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditEvent.create({ data: { businessId, actorId, action, entityType, entityId, requestId, metadata } });
}
function mapFinancialConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'This purchase operation already exists; retry with the same idempotency key', 'PURCHASE_CONFLICT');
    if (error.code === 'P2034' || error.code === 'P2028') {
      throw new HttpError(409, 'A concurrent purchase or financial change occurred; retry with the same idempotency key', 'FINANCIAL_CONFLICT');
    }
  }
  throw error;
}

router.use(authenticate);

router.get('/', requireBusinessPermission('purchasing:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = listSchema.parse(req.query);
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.q ? { OR: [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
      ] } : {}),
    },
    include: {
      supplier: { select: { id: true, code: true, name: true } },
      lines: { include: { variant: { include: { stockItem: { select: { name: true, baseUnit: true } } } } } },
      receipts: { select: { id: true, receiptNumber: true, receivedAt: true, total: true } },
      settlements: { select: { id: true, kind: true, amount: true, occurredAt: true } },
    },
    orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  });
  const items = orders.map((order) => {
    const received = order.receipts.reduce((sum, receipt) => sum.plus(receipt.total), new Prisma.Decimal(0));
    const paid = order.settlements.reduce((sum, settlement) => sum.plus(
      settlement.kind === 'PAYMENT' ? settlement.amount : settlement.amount.negated(),
    ), new Prisma.Decimal(0));
    const outstanding = received.minus(paid).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return {
      ...order,
      lines: order.lines.map((line) => {
        const remaining = line.orderedQuantity.minus(line.receivedQuantity);
        return { ...line, remainingQuantity: remaining.toFixed(6), hasRemainingQuantity: remaining.greaterThan(0) };
      }),
      receivedTotal: received.toFixed(2),
      outstanding: outstanding.toFixed(2),
      hasOutstanding: outstanding.greaterThan(0),
      refundCapacity: paid.toFixed(2),
      hasRefundCapacity: paid.greaterThan(0),
    };
  });
  res.json({ data: { items } });
}));

router.post('/', requireBusinessPermission('purchasing:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = orderInputSchema.parse(req.body);
  const key = idempotencyKey(req);
  await assertBusinessModuleEnabled(businessId, 'suppliers');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.purchaseOrder.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
        include: { supplier: true, lines: { include: { variant: { include: { stockItem: true } } } } },
      });
      if (replay) {
        const requestLines = input.lines.map((line) => [
          line.variantId,
          new Prisma.Decimal(line.quantity).toFixed(6),
          new Prisma.Decimal(line.unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4),
        ].join('|')).sort();
        const existingLines = replay.lines.map((line) => [
          line.variantId,
          line.orderedQuantity.toFixed(6),
          line.unitCost.toFixed(4),
        ].join('|')).sort();
        const descriptionMismatch = input.lines.some((line) => line.description !== undefined
          && !replay.lines.some((existingLine) => existingLine.variantId === line.variantId
            && existingLine.description === line.description
            && existingLine.orderedQuantity.equals(line.quantity)
            && existingLine.unitCost.equals(new Prisma.Decimal(line.unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP))));
        if (replay.supplierId !== input.supplierId
          || replay.notes !== (input.notes ?? null)
          || replay.dueAt?.getTime() !== (input.dueAt ? new Date(input.dueAt).getTime() : undefined)
          || (input.orderedAt !== undefined && replay.orderedAt.getTime() !== new Date(input.orderedAt).getTime())
          || requestLines.length !== existingLines.length
          || requestLines.some((line, index) => line !== existingLines[index])
          || descriptionMismatch) {
          throw new HttpError(409, 'Idempotency key was already used for a different purchase order', 'IDEMPOTENCY_CONFLICT');
        }
        return { order: replay, replayed: true };
      }
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, businessId, active: true } });
      if (!supplier) throw new HttpError(404, 'Active supplier not found', 'SUPPLIER_NOT_FOUND');
      const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
      const variants = await tx.stockVariant.findMany({
        where: { id: { in: variantIds }, businessId, active: true, stockItem: { active: true } },
        include: { stockItem: { select: { name: true, baseUnit: true } } },
      });
      if (variants.length !== variantIds.length) throw new HttpError(400, 'Every purchase item must be an active stock variant belonging to this business', 'INVALID_PURCHASE_ITEM');
      const variantById = new Map(variants.map((variant) => [variant.id, variant]));
      const lines = input.lines.map((line) => {
        const variant = variantById.get(line.variantId)!;
        const unitCost = new Prisma.Decimal(line.unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const lineTotal = new Prisma.Decimal(line.quantity).mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        return {
          variantId: line.variantId,
          description: line.description ?? `${variant.stockItem.name} / ${variant.name}`,
          orderedQuantity: new Prisma.Decimal(line.quantity),
          unitCost,
          lineTotal,
        };
      });
      const subtotal = lines.reduce((total, line) => total.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
      const sequence = await tx.business.update({
        where: { id: businessId }, data: { purchaseSequence: { increment: 1 } }, select: { slug: true, purchaseSequence: true },
      });
      const orderNumber = `PO-${sequence.slug.slice(0, 8).toUpperCase()}-${String(sequence.purchaseSequence).padStart(6, '0')}`;
      const order = await tx.purchaseOrder.create({
        data: {
          businessId,
          supplierId: supplier.id,
          orderNumber,
          status: 'ORDERED',
          orderedAt: input.orderedAt ? new Date(input.orderedAt) : new Date(),
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          subtotal,
          taxAmount: new Prisma.Decimal(0),
          total: subtotal,
          notes: input.notes,
          idempotencyKey: key,
          createdById: actorId,
          lines: { create: lines },
        },
        include: { supplier: true, lines: { include: { variant: { include: { stockItem: true } } } } },
      });
      await audit(tx, businessId, actorId, 'purchase_order.created', 'purchase_order', order.id, req.requestId, {
        orderNumber, supplierId: supplier.id, total: subtotal.toFixed(2), lineCount: lines.length,
      });
      return { order, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.order, replayed: result.replayed });
  } catch (error) { mapFinancialConflict(error); }
}));

router.post('/:purchaseOrderId/receive', requireBusinessPermission('purchasing:write'), requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const purchaseOrderId = uuidSchema.parse(req.params.purchaseOrderId);
  const input = receiveSchema.parse(req.body);
  const key = idempotencyKey(req);
  await assertBusinessModuleEnabled(businessId, 'inventory');
  await assertBusinessModuleEnabled(businessId, 'suppliers');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.purchaseReceipt.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
        include: { lines: true, purchaseOrder: { select: { id: true, orderNumber: true } } },
      });
      if (replay) {
        const lineMismatch = input.lines.length !== replay.lines.length || input.lines.some((line) => {
          const existingLine = replay.lines.find((item) => item.purchaseOrderLineId === line.purchaseOrderLineId);
          return !existingLine
            || !existingLine.quantity.equals(new Prisma.Decimal(line.quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP))
            || (line.unitCost !== undefined && !existingLine.unitCost.equals(new Prisma.Decimal(line.unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)))
            || (line.locationId !== undefined && existingLine.locationId !== line.locationId);
        });
        if (replay.purchaseOrderId !== purchaseOrderId
          || replay.invoiceReference !== (input.invoiceReference ?? null)
          || (input.receivedAt !== undefined && replay.receivedAt.getTime() !== new Date(input.receivedAt).getTime())
          || lineMismatch) {
          throw new HttpError(409, 'Idempotency key was already used for a different goods receipt', 'IDEMPOTENCY_CONFLICT');
        }
        return { receipt: replay, replayed: true };
      }
      const order = await tx.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, businessId },
        include: { lines: true, supplier: { select: { id: true, name: true } } },
      });
      if (!order || order.status === 'CANCELLED' || order.status === 'DRAFT') {
        throw new HttpError(404, 'An active ordered purchase order was not found', 'PURCHASE_ORDER_NOT_FOUND');
      }
      const orderLines = new Map(order.lines.map((line) => [line.id, line]));
      const receivedLines = input.lines.map((line) => {
        const orderLine = orderLines.get(line.purchaseOrderLineId);
        if (!orderLine) throw new HttpError(400, 'Receipt line does not belong to this purchase order', 'INVALID_RECEIPT_LINE');
        const remaining = orderLine.orderedQuantity.minus(orderLine.receivedQuantity);
        const quantity = new Prisma.Decimal(line.quantity);
        if (quantity.greaterThan(remaining)) {
          throw new HttpError(409, 'Received quantity cannot exceed the purchase order remaining quantity', 'RECEIVED_QUANTITY_EXCEEDS_ORDER');
        }
        return { ...line, orderLine, quantity, unitCost: new Prisma.Decimal(line.unitCost ?? orderLine.unitCost).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP) };
      });
      const receiptId = randomUUID();
      const sequence = await tx.business.update({
        where: { id: businessId }, data: { receiptSequence: { increment: 1 } }, select: { slug: true, receiptSequence: true },
      });
      const receiptNumber = `${sequence.slug.slice(0, 8).toUpperCase()}-G${String(sequence.receiptSequence).padStart(6, '0')}`;
      const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
      const preparedLines = receivedLines.map((line) => ({
        ...line,
        id: randomUUID(),
        totalCost: line.quantity.mul(line.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      }));
      const receiptTotal = preparedLines.reduce((sum, line) => sum.plus(line.totalCost), new Prisma.Decimal(0)).toDecimalPlaces(2);
      const receipt = await tx.purchaseReceipt.create({
        data: {
          id: receiptId,
          businessId,
          purchaseOrderId,
          receiptNumber,
          invoiceReference: input.invoiceReference,
          receivedAt,
          total: receiptTotal,
          idempotencyKey: key,
          actorId,
        },
      });
      const defaultLocation = await getOrCreateDefaultLocation(tx, businessId);
      for (const line of preparedLines) {
        const location = line.locationId
          ? await tx.inventoryLocation.findFirst({ where: { id: line.locationId, businessId, active: true } })
          : defaultLocation;
        if (!location) throw new HttpError(404, 'Receipt inventory location not found', 'INVENTORY_LOCATION_NOT_FOUND');
        await postInventoryMovement(tx, {
          businessId, actorId, variantId: line.orderLine.variantId, locationId: location.id,
          kind: 'RECEIPT', quantity: line.quantity.toFixed(6), unitCost: line.unitCost.toFixed(4),
          sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id,
          idempotencyKey: `${key}:${line.id}`, note: `Receipt ${receiptNumber}`, occurredAt: receivedAt,
          postLedger: false,
        });
        await tx.purchaseReceiptLine.create({
          data: {
            id: line.id, businessId, receiptId: receipt.id, purchaseOrderLineId: line.orderLine.id,
            variantId: line.orderLine.variantId, locationId: location.id, quantity: line.quantity,
            unitCost: line.unitCost, totalCost: line.totalCost,
          },
        });
        await tx.purchaseOrderLine.update({
          where: { id: line.orderLine.id }, data: { receivedQuantity: { increment: line.quantity } },
        });
      }
      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { businessId, purchaseOrderId } });
      const fullyReceived = updatedLines.every((line) => line.receivedQuantity.greaterThanOrEqualTo(line.orderedQuantity));
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED', version: { increment: 1 } },
      });
      if (!receiptTotal.isZero()) {
        const accounts = await ensureDefaultAccounts(tx, businessId);
        await postJournal(tx, {
          businessId, actorId, sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id,
          idempotencyKey: `purchase-receipt:${key}`, entryDate: receivedAt, memo: `Goods received ${receiptNumber}`,
          lines: [
            { accountId: accounts.get('INVENTORY')!.id, debit: receiptTotal, credit: 0 },
            { accountId: accounts.get('ACCOUNTS_PAYABLE')!.id, debit: 0, credit: receiptTotal },
          ],
        });
      }
      await audit(tx, businessId, actorId, 'purchase_order.goods_received', 'purchase_receipt', receipt.id, req.requestId, {
        purchaseOrderId, receiptNumber, supplierId: order.supplier.id, total: receiptTotal.toFixed(2), lineCount: preparedLines.length,
      });
      const created = await tx.purchaseReceipt.findFirstOrThrow({
        where: { id: receipt.id, businessId },
        include: { lines: { include: { variant: { include: { stockItem: true } }, location: true } }, purchaseOrder: true },
      });
      return { receipt: created, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.receipt, replayed: result.replayed });
  } catch (error) { mapFinancialConflict(error); }
}));

router.post('/:purchaseOrderId/settlements', requireBusinessPermission('purchasing:write'), requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const purchaseOrderId = uuidSchema.parse(req.params.purchaseOrderId);
  const input = settlementSchema.parse(req.body);
  const key = idempotencyKey(req);
  await assertBusinessModuleEnabled(businessId, 'suppliers');
  await assertBusinessModuleEnabled(businessId, 'cashbook');
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.supplierSettlement.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } } });
      if (replay) {
        if (replay.purchaseOrderId !== purchaseOrderId || replay.kind !== input.kind || !replay.amount.equals(amount)
          || replay.financialAccountId !== input.financialAccountId
          || replay.reference !== (input.reference ?? null) || replay.note !== (input.note ?? null)
          || (input.occurredAt !== undefined && replay.occurredAt.getTime() !== new Date(input.occurredAt).getTime())) {
          throw new HttpError(409, 'Idempotency key was already used for a different supplier settlement', 'IDEMPOTENCY_CONFLICT');
        }
        return { settlement: replay, replayed: true };
      }
      const order = await tx.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, businessId, status: { not: 'CANCELLED' } },
        include: { receipts: { select: { total: true } }, settlements: { select: { kind: true, amount: true } } },
      });
      if (!order) throw new HttpError(404, 'Purchase order not found', 'PURCHASE_ORDER_NOT_FOUND');
      const billed = order.receipts.reduce((sum, receipt) => sum.plus(receipt.total), new Prisma.Decimal(0));
      const paid = order.settlements.reduce((sum, settlement) => sum.plus(
        settlement.kind === 'PAYMENT' ? settlement.amount : settlement.amount.negated(),
      ), new Prisma.Decimal(0));
      if (input.kind === 'PAYMENT' && amount.greaterThan(billed.minus(paid))) {
        throw new HttpError(409, 'Supplier payment exceeds the received goods balance', 'SUPPLIER_PAYMENT_EXCEEDS_BALANCE');
      }
      const refundCapacity = order.settlements.reduce((sum, settlement) => sum.plus(
        settlement.kind === 'PAYMENT' ? settlement.amount : settlement.amount.negated(),
      ), new Prisma.Decimal(0));
      if (input.kind === 'REFUND' && amount.greaterThan(refundCapacity)) {
        throw new HttpError(409, 'Supplier refund exceeds net payments made for this purchase order', 'SUPPLIER_REFUND_EXCEEDS_PAYMENTS');
      }
      const account = await requireBusinessAccount(tx, businessId, input.financialAccountId, {
        types: ['ASSET'], mustBeCashbook: true,
      });
      const settlement = await tx.supplierSettlement.create({
        data: {
          businessId, supplierId: order.supplierId, purchaseOrderId, financialAccountId: account.id,
          kind: input.kind, amount, reference: input.reference, note: input.note,
          idempotencyKey: key, occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(), actorId,
        },
      });
      const accounts = await ensureDefaultAccounts(tx, businessId);
      const payableAccountId = accounts.get('ACCOUNTS_PAYABLE')!.id;
      const lines = input.kind === 'PAYMENT'
        ? [
          { accountId: payableAccountId, debit: amount, credit: 0 },
          { accountId: account.id, debit: 0, credit: amount },
        ]
        : [
          { accountId: account.id, debit: amount, credit: 0 },
          { accountId: payableAccountId, debit: 0, credit: amount },
        ];
      await postJournal(tx, {
        businessId, actorId, sourceType: input.kind === 'PAYMENT' ? 'SUPPLIER_PAYMENT' : 'SUPPLIER_REFUND', sourceId: settlement.id,
        idempotencyKey: `supplier-settlement:${key}`, entryDate: settlement.occurredAt,
        memo: `${input.kind === 'PAYMENT' ? 'Supplier payment' : 'Supplier refund'} ${order.orderNumber}`,
        lines,
      });
      await audit(tx, businessId, actorId, input.kind === 'PAYMENT' ? 'supplier.payment_posted' : 'supplier.refund_posted',
        'supplier_settlement', settlement.id, req.requestId, {
          purchaseOrderId, supplierId: order.supplierId, amount: amount.toFixed(2), financialAccountId: account.id,
        });
      return { settlement, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.settlement, replayed: result.replayed });
  } catch (error) { mapFinancialConflict(error); }
}));

export default router;
