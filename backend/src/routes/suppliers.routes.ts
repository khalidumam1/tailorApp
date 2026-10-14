import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

const router = express.Router();
const uuidSchema = z.string().uuid();
const supplierInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();
const supplierUpdateSchema = supplierInputSchema.partial().extend({
  version: z.number().int().positive(),
  active: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'version'), 'Provide a supplier change');
const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  includeInactive: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  cursor: uuidSchema.optional(),
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
  supplierId: string,
  requestId: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditEvent.create({ data: {
    businessId, actorId, action, entityType: 'supplier', entityId: supplierId, requestId, metadata,
  } });
}

router.use(authenticate);

router.get('/', requireBusinessPermission('suppliers:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = querySchema.parse(req.query);
  if (query.cursor) {
    const cursor = await prisma.supplier.findFirst({ where: { id: query.cursor, businessId }, select: { id: true } });
    if (!cursor) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const suppliers = await prisma.supplier.findMany({
    where: {
      businessId,
      ...(query.includeInactive ? {} : { active: true }),
      ...(query.q ? { OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
    },
    include: { _count: { select: { purchaseOrders: true, settlements: true } } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = suppliers.length > query.limit;
  const items = hasMore ? suppliers.slice(0, query.limit) : suppliers;
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

router.post('/', requireBusinessPermission('suppliers:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = supplierInputSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.supplier.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } } });
      if (replay) {
        if (replay.name !== input.name
          || replay.contactName !== (input.contactName ?? null)
          || replay.phone !== (input.phone ?? null)
          || replay.email !== (input.email ?? null)
          || replay.address !== (input.address ?? null)
          || replay.notes !== (input.notes ?? null)) {
          throw new HttpError(409, 'Idempotency key was already used to create a different supplier', 'IDEMPOTENCY_CONFLICT');
        }
        return { supplier: replay, replayed: true };
      }
      const sequence = await tx.business.update({ where: { id: businessId }, data: { supplierSequence: { increment: 1 } }, select: { supplierSequence: true } });
      const supplier = await tx.supplier.create({
        data: { businessId, code: `SUP-${String(sequence.supplierSequence).padStart(6, '0')}`, ...input, idempotencyKey: key },
      });
      await audit(tx, businessId, actorId, 'supplier.created', supplier.id, req.requestId, { code: supplier.code, name: supplier.name });
      return { supplier, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.supplier, replayed: result.replayed });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
      throw new HttpError(409, 'Supplier or code already exists; retry with the same idempotency key', 'SUPPLIER_CONFLICT');
    }
    throw error;
  }
}));

router.patch('/:supplierId', requireBusinessPermission('suppliers:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const supplierId = uuidSchema.parse(req.params.supplierId);
  const { version, ...changes } = supplierUpdateSchema.parse(req.body);
  const supplier = await prisma.$transaction(async (tx) => {
    const update = await tx.supplier.updateMany({
      where: { id: supplierId, businessId, version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (update.count !== 1) throw new HttpError(409, 'Supplier changed; refresh and retry', 'VERSION_CONFLICT');
    const updated = await tx.supplier.findFirstOrThrow({ where: { id: supplierId, businessId } });
    await audit(tx, businessId, actorId, 'supplier.updated', supplierId, req.requestId, { changes });
    return updated;
  });
  res.json({ data: supplier });
}));

router.get('/:supplierId/ledger', requireBusinessPermission('suppliers:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const supplierId = uuidSchema.parse(req.params.supplierId);
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, businessId },
    select: { id: true, code: true, name: true, phone: true, email: true },
  });
  if (!supplier) throw new HttpError(404, 'Supplier not found', 'SUPPLIER_NOT_FOUND');
  const [receipts, settlements] = await Promise.all([
    prisma.purchaseReceipt.findMany({
      where: { businessId, purchaseOrder: { supplierId } },
      select: { id: true, receiptNumber: true, receivedAt: true, total: true, purchaseOrder: { select: { orderNumber: true } } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.supplierSettlement.findMany({
      where: { businessId, supplierId },
      select: { id: true, kind: true, amount: true, occurredAt: true, reference: true, note: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  let balance = new Prisma.Decimal(0);
  const entries = [
    ...receipts.map((entry) => ({
      id: entry.id,
      kind: 'BILL' as const,
      occurredAt: entry.receivedAt,
      amount: entry.total,
      reference: entry.receiptNumber,
      purchaseOrderNumber: entry.purchaseOrder.orderNumber,
      note: null,
    })),
    ...settlements.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      occurredAt: entry.occurredAt,
      amount: entry.kind === 'PAYMENT' ? entry.amount.negated() : entry.amount,
      reference: entry.reference,
      purchaseOrderNumber: null,
      note: entry.note,
    })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const ledger = entries.map((entry) => {
    balance = balance.plus(entry.amount);
    return { ...entry, amount: entry.amount.toFixed(2), runningBalance: balance.toFixed(2) };
  });
  res.json({ data: { supplier, entries: ledger, balance: balance.toFixed(2) } });
}));

export default router;
