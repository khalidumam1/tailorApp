import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { assertJournalBalanced } from '../domain/erp-finance.js';
import { getOrCreateDefaultLocation, inventoryValuation, postInventoryMovement } from '../domain/inventory.js';
import { postJournal } from '../domain/accounting.js';

const router = express.Router();
const uuidSchema = z.string().uuid();
const decimalSchema = (places: number) => z.string().regex(new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${places}})?$`));
const positiveQuantitySchema = decimalSchema(6).refine((value) => new Prisma.Decimal(value).greaterThan(0));
const positiveCostSchema = decimalSchema(4);
const openingSchema = z.object({
  quantity: positiveQuantitySchema,
  unitCost: positiveCostSchema,
  locationId: uuidSchema.optional(),
}).strict();
const variantInputSchema = z.object({
  name: z.string().trim().min(1).max(160).default('Standard'),
  sku: z.string().trim().max(80).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  opening: openingSchema.optional(),
}).strict();
const itemInputSchema = z.object({
  kind: z.enum(['MATERIAL', 'PRODUCT', 'SUPPLY']),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  baseUnit: z.string().trim().min(1).max(40),
  reorderPoint: decimalSchema(6).nullable().optional(),
  variant: variantInputSchema.default({}),
}).strict();
const itemUpdateSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  baseUnit: z.string().trim().min(1).max(40).optional(),
  reorderPoint: decimalSchema(6).nullable().optional(),
  active: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'version'), 'Provide an inventory item change');
const variantCreateSchema = variantInputSchema;
const movementSchema = z.object({
  variantId: uuidSchema,
  locationId: uuidSchema.optional(),
  kind: z.enum(['OPENING', 'RECEIPT', 'CONSUMPTION', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'WASTAGE', 'ADJUSTMENT']),
  direction: z.enum(['IN', 'OUT']).optional(),
  quantity: positiveQuantitySchema,
  unitCost: positiveCostSchema.optional(),
  counterAccountId: uuidSchema.optional(),
  note: z.string().trim().max(500).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((input, context) => {
  if (input.kind === 'ADJUSTMENT' && !input.direction) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['direction'], message: 'Choose whether this adjustment adds or removes stock' });
  }
  if (['OPENING', 'RECEIPT', 'CUSTOMER_RETURN'].includes(input.kind) && !input.unitCost) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['unitCost'], message: 'Unit cost is required for opening stock, receipts and customer returns' });
  }
});
const transferSchema = z.object({
  variantId: uuidSchema,
  fromLocationId: uuidSchema,
  toLocationId: uuidSchema,
  quantity: positiveQuantitySchema,
  note: z.string().trim().max(500).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
}).strict().refine((input) => input.fromLocationId !== input.toLocationId, 'Choose two different locations');
const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  kind: z.enum(['MATERIAL', 'PRODUCT', 'SUPPLY']).optional(),
  includeInactive: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const movementQuerySchema = z.object({
  variantId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  kind: z.enum(['OPENING', 'RECEIPT', 'CONSUMPTION', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function context(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function idempotencyKey(req: express.Request, suffix = ''): string {
  const parsed = uuidSchema.safeParse(req.header('Idempotency-Key'));
  if (!parsed.success) throw new HttpError(400, 'A UUID Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED');
  return `${parsed.data}${suffix}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function mapConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'This item, code or idempotency key already exists', 'INVENTORY_CONFLICT');
    if (error.code === 'P2034' || error.code === 'P2028') {
      throw new HttpError(409, 'A concurrent stock change occurred; retry with the same idempotency key', 'INVENTORY_CONFLICT');
    }
  }
  throw error;
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
  await tx.auditEvent.create({
    data: { businessId, actorId, action, entityType, entityId, requestId, metadata },
  });
}

router.use(authenticate);

router.get('/locations', requireBusinessPermission('inventory:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const locations = await prisma.inventoryLocation.findMany({
    where: { businessId, active: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  res.json({ data: { items: locations } });
}));

router.post('/locations', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = z.object({
    code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(120),
  }).strict().parse(req.body);
  try {
    const location = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryLocation.create({ data: { businessId, ...input } });
      await audit(tx, businessId, actorId, 'inventory.location_created', 'inventory_location', created.id, req.requestId, {
        code: created.code, name: created.name,
      });
      return created;
    });
    res.status(201).json({ data: location });
  } catch (error) { mapConflict(error); }
}));

router.get('/valuation', requireBusinessPermission('inventory:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const [valuation, business] = await Promise.all([
    inventoryValuation(prisma, businessId),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  res.json({ data: { ...valuation, currency: business?.currency ?? 'PKR' } });
}));

router.get('/reorder-alerts', requireBusinessPermission('inventory:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const [variants, totals] = await Promise.all([
    prisma.stockVariant.findMany({
      where: { businessId, active: true, stockItem: { active: true, reorderPoint: { not: null } } },
      include: { stockItem: { select: { id: true, name: true, kind: true, baseUnit: true, reorderPoint: true } } },
      orderBy: [{ stockItem: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.inventoryBalance.groupBy({ by: ['variantId'], where: { businessId }, _sum: { quantity: true } }),
  ]);
  const quantities = new Map(totals.map((row) => [row.variantId, row._sum.quantity ?? new Prisma.Decimal(0)]));
  const alerts = variants.flatMap((variant) => {
    const quantity = quantities.get(variant.id) ?? new Prisma.Decimal(0);
    const point = variant.stockItem.reorderPoint;
    return point && quantity.lessThanOrEqualTo(point) ? [{
      variantId: variant.id,
      itemId: variant.stockItem.id,
      itemName: variant.stockItem.name,
      variantName: variant.name,
      kind: variant.stockItem.kind,
      quantity: quantity.toFixed(6),
      reorderPoint: point.toFixed(6),
      unit: variant.stockItem.baseUnit,
    }] : [];
  });
  res.json({ data: { items: alerts, count: alerts.length } });
}));

router.get('/items', requireBusinessPermission('inventory:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = listSchema.parse(req.query);
  const items = await prisma.stockItem.findMany({
    where: {
      businessId,
      ...(query.includeInactive ? {} : { active: true }),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q ? { OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: query.q, mode: 'insensitive' } } } },
      ] } : {}),
    },
    include: {
      variants: {
        where: query.includeInactive ? {} : { active: true },
        include: {
          balances: { include: { location: { select: { id: true, code: true, name: true } } }, orderBy: { location: { name: 'asc' } } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: query.limit,
  });
  res.json({ data: { items } });
}));

router.post('/items', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = itemInputSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.stockItem.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
        include: { variants: { include: { balances: { include: { location: true } } } } },
      });
      if (replay) {
        const replayVariant = replay.variants.find((variant) => variant.idempotencyKey === `${key}:variant`);
        const replayOpening = await tx.inventoryMovement.findUnique({
          where: { businessId_idempotencyKey: { businessId, idempotencyKey: `${key}:opening` } },
        });
        const openingMismatch = input.variant.opening
          ? !replayOpening
            || replayOpening.variantId !== replayVariant?.id
            || replayOpening.sourceId !== replay.id
            || replayOpening.kind !== 'OPENING'
            || !replayOpening.quantity.equals(new Prisma.Decimal(input.variant.opening.quantity))
            || !replayOpening.unitCost.equals(new Prisma.Decimal(input.variant.opening.unitCost))
            || (input.variant.opening.locationId !== undefined && replayOpening.locationId !== input.variant.opening.locationId)
          : replayOpening !== null;
        if (replay.name !== input.name || replay.kind !== input.kind || replay.baseUnit !== input.baseUnit
          || replay.description !== (input.description ?? null)
          || replay.reorderPoint?.toFixed(6) !== (input.reorderPoint ? new Prisma.Decimal(input.reorderPoint).toFixed(6) : undefined)
          || !replayVariant || replayVariant.name !== input.variant.name
          || replayVariant.sku !== (input.variant.sku ?? null)
          || canonicalJson(replayVariant.attributes) !== canonicalJson(input.variant.attributes)
          || openingMismatch) {
          throw new HttpError(409, 'Idempotency key was already used to create a different stock item', 'IDEMPOTENCY_CONFLICT');
        }
        return { item: replay, replayed: true };
      }
      const item = await tx.stockItem.create({
        data: {
          businessId,
          kind: input.kind,
          name: input.name,
          description: input.description,
          baseUnit: input.baseUnit,
          reorderPoint: input.reorderPoint ? new Prisma.Decimal(input.reorderPoint) : null,
          idempotencyKey: key,
          variants: { create: {
            businessId,
            name: input.variant.name,
            sku: input.variant.sku,
            attributes: input.variant.attributes as Prisma.InputJsonValue,
            idempotencyKey: `${key}:variant`,
          } },
        },
        include: { variants: true },
      });
      if (input.variant.opening) {
        const location = input.variant.opening.locationId
          ? await tx.inventoryLocation.findFirst({ where: { id: input.variant.opening.locationId, businessId, active: true } })
          : await getOrCreateDefaultLocation(tx, businessId);
        if (!location) throw new HttpError(404, 'Opening balance location not found', 'INVENTORY_LOCATION_NOT_FOUND');
        await postInventoryMovement(tx, {
          businessId, actorId, variantId: item.variants[0]!.id, locationId: location.id,
          kind: 'OPENING', quantity: input.variant.opening.quantity, unitCost: input.variant.opening.unitCost,
          sourceType: 'OPENING_STOCK', sourceId: item.id, idempotencyKey: `${key}:opening`,
          note: 'Opening stock', postLedger: true,
        });
      }
      await audit(tx, businessId, actorId, 'inventory.item_created', 'stock_item', item.id, req.requestId, {
        kind: input.kind, name: input.name, variantName: input.variant.name,
        openingQuantity: input.variant.opening?.quantity ?? null,
      });
      const hydrated = await tx.stockItem.findFirstOrThrow({
        where: { id: item.id, businessId },
        include: { variants: { include: { balances: { include: { location: true } } } } },
      });
      return { item: hydrated, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.item, replayed: result.replayed });
  } catch (error) { mapConflict(error); }
}));

router.post('/items/:itemId/variants', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const itemId = uuidSchema.parse(req.params.itemId);
  const input = variantCreateSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const parent = await tx.stockItem.findFirst({ where: { id: itemId, businessId, active: true } });
      if (!parent) throw new HttpError(404, 'Active inventory item not found', 'STOCK_ITEM_NOT_FOUND');
      const replay = await tx.stockVariant.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } },
        include: { balances: { include: { location: true } } },
      });
      if (replay) {
        const replayOpening = await tx.inventoryMovement.findUnique({
          where: { businessId_idempotencyKey: { businessId, idempotencyKey: `${key}:opening` } },
        });
        const openingMismatch = input.opening
          ? !replayOpening
            || replayOpening.variantId !== replay.id
            || replayOpening.sourceId !== replay.id
            || replayOpening.kind !== 'OPENING'
            || !replayOpening.quantity.equals(new Prisma.Decimal(input.opening.quantity))
            || !replayOpening.unitCost.equals(new Prisma.Decimal(input.opening.unitCost))
            || (input.opening.locationId !== undefined && replayOpening.locationId !== input.opening.locationId)
          : replayOpening !== null;
        if (replay.stockItemId !== itemId || replay.name !== input.name
          || replay.sku !== (input.sku ?? null)
          || canonicalJson(replay.attributes) !== canonicalJson(input.attributes)
          || openingMismatch) {
          throw new HttpError(409, 'Idempotency key was already used to create a different variant', 'IDEMPOTENCY_CONFLICT');
        }
        return { variant: replay, replayed: true };
      }
      const variant = await tx.stockVariant.create({
        data: {
          businessId, stockItemId: itemId, name: input.name, sku: input.sku,
          attributes: input.attributes as Prisma.InputJsonValue, idempotencyKey: key,
        },
      });
      if (input.opening) {
        const location = input.opening.locationId
          ? await tx.inventoryLocation.findFirst({ where: { id: input.opening.locationId, businessId, active: true } })
          : await getOrCreateDefaultLocation(tx, businessId);
        if (!location) throw new HttpError(404, 'Opening balance location not found', 'INVENTORY_LOCATION_NOT_FOUND');
        await postInventoryMovement(tx, {
          businessId, actorId, variantId: variant.id, locationId: location.id,
          kind: 'OPENING', quantity: input.opening.quantity, unitCost: input.opening.unitCost,
          sourceType: 'OPENING_STOCK', sourceId: variant.id, idempotencyKey: `${key}:opening`,
          note: 'Opening stock',
        });
      }
      await audit(tx, businessId, actorId, 'inventory.variant_created', 'stock_variant', variant.id, req.requestId, {
        stockItemId: itemId, name: input.name, openingQuantity: input.opening?.quantity ?? null,
      });
      const hydratedVariant = await tx.stockVariant.findFirstOrThrow({
        where: { id: variant.id, businessId },
        include: { balances: { include: { location: true } } },
      });
      return { variant: hydratedVariant, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.variant, replayed: result.replayed });
  } catch (error) { mapConflict(error); }
}));

router.patch('/items/:itemId', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const itemId = uuidSchema.parse(req.params.itemId);
  const input = itemUpdateSchema.parse(req.body);
  const { version, ...changes } = input;
  try {
    const item = await prisma.$transaction(async (tx) => {
      const update = await tx.stockItem.updateMany({
        where: { id: itemId, businessId, version },
        data: {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.description !== undefined ? { description: changes.description } : {}),
          ...(changes.baseUnit !== undefined ? { baseUnit: changes.baseUnit } : {}),
          ...(changes.reorderPoint !== undefined ? { reorderPoint: changes.reorderPoint === null ? null : new Prisma.Decimal(changes.reorderPoint) } : {}),
          ...(changes.active !== undefined ? { active: changes.active } : {}),
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw new HttpError(409, 'Inventory item changed; refresh and retry', 'VERSION_CONFLICT');
      const updated = await tx.stockItem.findFirstOrThrow({ where: { id: itemId, businessId }, include: { variants: true } });
      await audit(tx, businessId, actorId, 'inventory.item_updated', 'stock_item', itemId, req.requestId, { changes });
      return updated;
    });
    res.json({ data: item });
  } catch (error) { mapConflict(error); }
}));

router.get('/movements', requireBusinessPermission('inventory:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = movementQuerySchema.parse(req.query);
  if (query.cursor) {
    const cursor = await prisma.inventoryMovement.findFirst({ where: { id: query.cursor, businessId }, select: { id: true } });
    if (!cursor) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      businessId,
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.from || query.to ? { occurredAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      } } : {}),
    },
    include: {
      variant: { include: { stockItem: { select: { id: true, name: true, baseUnit: true } } } },
      location: { select: { id: true, code: true, name: true } },
      reversalOf: { select: { id: true, kind: true } },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = movements.length > query.limit;
  const items = hasMore ? movements.slice(0, query.limit) : movements;
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

router.post('/movements', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = movementSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const location = input.locationId
        ? await tx.inventoryLocation.findFirst({ where: { id: input.locationId, businessId, active: true } })
        : await getOrCreateDefaultLocation(tx, businessId);
      if (!location) throw new HttpError(404, 'Active inventory location not found', 'INVENTORY_LOCATION_NOT_FOUND');
      const movement = await postInventoryMovement(tx, {
        businessId, actorId, variantId: input.variantId, locationId: location.id,
        kind: input.kind, direction: input.direction, quantity: input.quantity, unitCost: input.unitCost,
        counterAccountId: input.counterAccountId, sourceType: 'MANUAL', sourceId: key,
        idempotencyKey: key, note: input.note, occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      });
      await audit(tx, businessId, actorId, 'inventory.movement_posted', 'inventory_movement', movement.id, req.requestId, {
        kind: movement.kind, quantity: movement.quantity.toFixed(6), variantId: movement.variantId, locationId: movement.locationId,
      });
      return movement;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(201).json({ data: result });
  } catch (error) { mapConflict(error); }
}));

router.post('/transfers', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = transferSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.inventoryLocation.findFirst({ where: { id: input.fromLocationId, businessId, active: true } }),
        tx.inventoryLocation.findFirst({ where: { id: input.toLocationId, businessId, active: true } }),
      ]);
      if (!from || !to) throw new HttpError(404, 'Both active inventory locations must belong to this business', 'INVENTORY_LOCATION_NOT_FOUND');
      const movedOut = await postInventoryMovement(tx, {
        businessId, actorId, variantId: input.variantId, locationId: from.id,
        kind: 'TRANSFER_OUT', quantity: input.quantity, sourceType: 'TRANSFER', sourceId: key,
        idempotencyKey: `${key}:out`, note: input.note, occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      });
      const movedIn = await postInventoryMovement(tx, {
        businessId, actorId, variantId: input.variantId, locationId: to.id,
        kind: 'TRANSFER_IN', quantity: input.quantity, unitCost: movedOut.unitCost.toFixed(4),
        sourceType: 'TRANSFER', sourceId: key, idempotencyKey: `${key}:in`, note: input.note,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      });
      await audit(tx, businessId, actorId, 'inventory.transferred', 'inventory_movement', movedOut.id, req.requestId, {
        variantId: input.variantId, fromLocationId: from.id, toLocationId: to.id, quantity: input.quantity, movementIds: [movedOut.id, movedIn.id],
      });
      return { movedOut, movedIn };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(201).json({ data: result });
  } catch (error) { mapConflict(error); }
}));

router.post('/movements/:movementId/reversals', requireBusinessPermission('inventory:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const movementId = uuidSchema.parse(req.params.movementId);
  const input = z.object({ reason: z.string().trim().min(1).max(500) }).strict().parse(req.body);
  const key = idempotencyKey(req);
  try {
    const reversal = await prisma.$transaction(async (tx) => {
      const replay = await tx.inventoryMovement.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: `${key}:reversal` } },
      });
      if (replay) {
        if (replay.reversalOfId !== movementId || replay.note !== input.reason) {
          throw new HttpError(409, 'Idempotency key was already used for another stock correction', 'IDEMPOTENCY_CONFLICT');
        }
        return replay;
      }
      const original = await tx.inventoryMovement.findFirst({ where: { id: movementId, businessId } });
      if (!original) throw new HttpError(404, 'Inventory movement not found', 'INVENTORY_MOVEMENT_NOT_FOUND');
      if (original.reversalOfId || ['OPENING', 'TRANSFER_IN', 'TRANSFER_OUT'].includes(original.kind)
        || original.sourceType === 'PURCHASE_RECEIPT') {
        throw new HttpError(409, 'This movement must be corrected through its original workflow; it cannot be directly reversed', 'MOVEMENT_REVERSAL_NOT_ALLOWED');
      }
      const balance = await tx.inventoryBalance.findUnique({
        where: { businessId_variantId_locationId: {
          businessId, variantId: original.variantId, locationId: original.locationId,
        } },
      });
      if (!balance || balance.lastMovementId !== original.id) {
        throw new HttpError(409, 'Only the latest stock movement can be reversed safely; post a compensating adjustment instead', 'MOVEMENT_NOT_LATEST');
      }
      const previousReversal = await tx.inventoryMovement.findFirst({ where: { businessId, reversalOfId: original.id } });
      if (previousReversal) throw new HttpError(409, 'This stock movement has already been reversed', 'MOVEMENT_ALREADY_REVERSED');
      const reversalId = randomUUID();
      const reversed = await tx.inventoryMovement.create({
        data: {
          id: reversalId,
          businessId,
          variantId: original.variantId,
          locationId: original.locationId,
          kind: 'ADJUSTMENT',
          quantity: original.quantity.negated(),
          unitCost: original.unitCost,
          totalCost: original.totalCost,
          balanceBefore: balance.quantity,
          balanceAfter: original.balanceBefore,
          averageCostBefore: balance.averageUnitCost,
          averageCostAfter: original.averageCostBefore,
          sourceType: 'REVERSAL',
          sourceId: original.id,
          idempotencyKey: `${key}:reversal`,
          note: input.reason,
          actorId,
          reversalOfId: original.id,
          occurredAt: new Date(),
        },
      });
      await tx.inventoryBalance.update({
        where: { businessId_variantId_locationId: {
          businessId, variantId: original.variantId, locationId: original.locationId,
        } },
        data: { quantity: original.balanceBefore, averageUnitCost: original.averageCostBefore, lastMovementId: reversed.id },
      });
      const originalJournal = await tx.journalEntry.findFirst({
        where: { businessId, sourceType: 'INVENTORY_MOVEMENT', sourceId: original.id },
        include: { lines: true },
      });
      if (originalJournal) {
        const lines = originalJournal.lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, memo: line.memo ?? undefined }));
        assertJournalBalanced(lines.map((line) => ({ debit: line.debit.toFixed(2), credit: line.credit.toFixed(2) })));
        await postJournal(tx, {
          businessId, actorId, sourceType: 'INVENTORY_REVERSAL', sourceId: reversed.id,
          idempotencyKey: `inventory-reversal:${key}`, entryDate: new Date(), memo: `Reversal: ${input.reason}`,
          reversalOfId: originalJournal.id, allowInactiveAccounts: true, lines,
        });
      }
      await audit(tx, businessId, actorId, 'inventory.movement_reversed', 'inventory_movement', reversed.id, req.requestId, {
        reversalOfId: original.id, reason: input.reason,
      });
      return reversed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(201).json({ data: reversal });
  } catch (error) { mapConflict(error); }
}));

export default router;
