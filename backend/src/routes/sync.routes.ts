import { Prisma } from '@prisma/client';
import express from 'express';
import {
  createCustomerSchema,
  createOrderSchema,
  garmentTemplateFieldSchema,
  normalizePakistanPhone,
  toE164Phone,
  syncOperationSchema,
} from '@tailor/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { assertSubscriptionAccess, authenticate } from '../middleware/auth.js';
import { assertPlanLimit } from '../plan-limits.js';
import { queueOrderCreated } from '../whatsapp.js';

const router = express.Router();
const idSchema = z.string().uuid();
const changesSchema = createCustomerSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  'At least one customer field must be provided',
);
const syncPayloadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('customer.create'), customer: createCustomerSchema }),
  z.object({ action: z.literal('customer.update'), changes: changesSchema }),
  z.object({
    action: z.literal('measurement.revision'),
    customerId: idSchema,
    garmentTemplateId: idSchema,
    values: z.record(z.string(), z.union([z.string().trim().max(120), z.number().finite()])),
    notes: z.string().trim().max(2000).optional(),
    measuredAt: z.string().datetime({ offset: true }),
  }),
  z.object({ action: z.literal('order.create'), order: createOrderSchema }),
]);
const batchSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(50),
});
const cursorEntrySchema = z.object({ at: z.string().datetime({ offset: true }), id: idSchema });
const cursorSchema = z.object({
  customers: cursorEntrySchema.nullable().optional(),
  orders: cursorEntrySchema.nullable().optional(),
  measurements: cursorEntrySchema.nullable().optional(),
}).strict();
const changesQuerySchema = z.object({
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type CursorEntry = z.infer<typeof cursorEntrySchema>;
type SyncCursor = z.infer<typeof cursorSchema>;
type OperationInput = z.infer<typeof syncOperationSchema>;
type OperationResult = {
  clientOperationId: string;
  status: 'APPLIED' | 'CONFLICT';
  response: Prisma.JsonValue | Record<string, unknown>;
  duplicate?: boolean;
};

function getBusinessContext(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function encodeCursor(cursor: SyncCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string | undefined): SyncCursor {
  if (!value) return {};
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(400, 'Sync cursor is invalid', 'INVALID_SYNC_CURSOR');
  }
  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success) throw new HttpError(400, 'Sync cursor is invalid', 'INVALID_SYNC_CURSOR');
  return parsed.data;
}

function cursorWhere(entry: CursorEntry | null | undefined): Prisma.CustomerWhereInput {
  if (!entry) return {};
  const at = new Date(entry.at);
  return { OR: [{ updatedAt: { gt: at } }, { updatedAt: at, id: { gt: entry.id } }] };
}

function cursorOrderWhere(entry: CursorEntry | null | undefined): Prisma.OrderWhereInput {
  if (!entry) return {};
  const at = new Date(entry.at);
  return { OR: [{ updatedAt: { gt: at } }, { updatedAt: at, id: { gt: entry.id } }] };
}

function cursorMeasurementWhere(entry: CursorEntry | null | undefined): Prisma.MeasurementRevisionWhereInput {
  if (!entry) return {};
  const at = new Date(entry.at);
  return {
    OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: entry.id } }],
  };
}

function nextEntry<T extends { id: string; updatedAt: Date }>(
  page: T[],
  previous: CursorEntry | null | undefined,
): CursorEntry | null {
  const last = page.at(-1);
  return last ? { id: last.id, at: last.updatedAt.toISOString() } : previous ?? null;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function applyOperation(
  tx: Prisma.TransactionClient,
  operation: OperationInput,
  businessId: string,
  actorId: string,
  requestId: string,
): Promise<{ status: 'APPLIED' | 'CONFLICT'; response: Record<string, unknown> }> {
  const payload = syncPayloadSchema.parse(operation.payload);
  const conflict = (code: string, details: Record<string, unknown> = {}) => ({
    status: 'CONFLICT' as const,
    response: { code, ...details },
  });

  if (payload.action === 'customer.create' || payload.action === 'customer.update') {
    if (operation.entityType !== 'customer') {
      throw new HttpError(400, 'Operation action and entity type do not match', 'INVALID_SYNC_OPERATION');
    }
    if (payload.action === 'customer.create') {
      const exists = await tx.customer.findFirst({
        where: { businessId, OR: [{ id: operation.entityId }, { phoneNormalized: normalizePakistanPhone(payload.customer.phone) }] },
        select: { id: true, version: true },
      });
      if (exists) return conflict('CUSTOMER_ALREADY_EXISTS', { entityId: exists.id, version: exists.version });
      const customer = await tx.customer.create({
        data: {
          id: operation.entityId,
          businessId,
          name: payload.customer.name,
          phone: toE164Phone(payload.customer.phone),
          phoneNormalized: normalizePakistanPhone(payload.customer.phone),
          notes: payload.customer.notes,
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'customer.created',
          entityType: 'customer',
          entityId: customer.id,
          metadata: { source: 'offline_sync', clientOperationId: operation.clientOperationId },
          requestId,
        },
      });
      return { status: 'APPLIED', response: { entityId: customer.id, version: customer.version, updatedAt: customer.updatedAt } };
    }

    if (operation.baseVersion === undefined) {
      throw new HttpError(400, 'Customer updates require a baseVersion', 'SYNC_BASE_VERSION_REQUIRED');
    }
    const input = changesSchema.parse(payload.changes);
    if (input.phone !== undefined) {
      const duplicate = await tx.customer.findFirst({
        where: {
          businessId,
          phoneNormalized: normalizePakistanPhone(input.phone),
          id: { not: operation.entityId },
        },
        select: { id: true },
      });
      if (duplicate) return conflict('DUPLICATE_CUSTOMER_PHONE', { entityId: duplicate.id });
    }
    const currentPhone = input.phone !== undefined
      ? await tx.customer.findFirst({
        where: { id: operation.entityId, businessId, deletedAt: null },
        select: { phoneNormalized: true },
      })
      : null;
    const phoneChanged = input.phone !== undefined
      && currentPhone?.phoneNormalized !== normalizePakistanPhone(input.phone);
    const updatedCount = await tx.customer.updateMany({
      where: {
        id: operation.entityId,
        businessId,
        deletedAt: null,
        version: operation.baseVersion,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? {
          phone: toE164Phone(input.phone),
          phoneNormalized: normalizePakistanPhone(input.phone),
        } : {}),
        ...(phoneChanged ? {
          whatsappConsent: false,
          whatsappConsentAt: null,
          whatsappOptedOutAt: null,
        } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        version: { increment: 1 },
      },
    });
    if (!updatedCount.count) {
      const current = await tx.customer.findFirst({
        where: { id: operation.entityId, businessId },
        select: { version: true, updatedAt: true, deletedAt: true },
      });
      return conflict(current ? 'VERSION_CONFLICT' : 'CUSTOMER_NOT_FOUND', current ?? {});
    }
    if (phoneChanged) {
      await tx.whatsAppNotification.updateMany({
        where: { businessId, customerId: operation.entityId, status: 'QUEUED' },
        data: { status: 'NOT_SENT', lastError: 'Customer phone number changed before delivery', failedAt: new Date() },
      });
    }
    const customer = await tx.customer.findFirstOrThrow({
      where: { id: operation.entityId, businessId },
    });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: customer.id,
        metadata: { source: 'offline_sync', version: customer.version, phoneChanged },
        requestId,
      },
    });
    return { status: 'APPLIED', response: { entityId: customer.id, version: customer.version, updatedAt: customer.updatedAt } };
  }

  if (payload.action === 'measurement.revision') {
    if (operation.entityType !== 'measurement') {
      throw new HttpError(400, 'Operation action and entity type do not match', 'INVALID_SYNC_OPERATION');
    }
    const customer = await tx.customer.findFirst({
      where: { id: payload.customerId, businessId, deletedAt: null },
      select: { id: true },
    });
    const template = await tx.garmentTemplate.findFirst({
      where: { id: payload.garmentTemplateId, active: true, OR: [{ businessId }, { businessId: null }] },
      select: { id: true, fields: true },
    });
    if (!customer || !template) return conflict('MEASUREMENT_REFERENCE_NOT_FOUND');
    const fields = z.array(garmentTemplateFieldSchema).safeParse(template.fields);
    if (!fields.success) throw new HttpError(500, 'Garment template configuration is invalid', 'INVALID_TEMPLATE_CONFIGURATION');
    const allowedFields = new Set(fields.data.map((field) => field.key));
    if (Object.keys(payload.values).some((key) => !allowedFields.has(key))) {
      throw new HttpError(400, 'Measurement contains an unknown field', 'UNKNOWN_MEASUREMENT_FIELD');
    }
    if (fields.data.some((field) => field.required && payload.values[field.key] === undefined)) {
      throw new HttpError(400, 'A required measurement field is missing', 'REQUIRED_MEASUREMENT_MISSING');
    }
    const existingProfile = await tx.measurementProfile.findUnique({
      where: {
        businessId_customerId_garmentTemplateId: {
          businessId,
          customerId: customer.id,
          garmentTemplateId: template.id,
        },
      },
    });
    if (existingProfile && existingProfile.id !== operation.entityId) {
      return conflict('MEASUREMENT_PROFILE_ALREADY_EXISTS', { profileId: existingProfile.id });
    }
    const currentVersion = existingProfile
      ? (await tx.measurementRevision.aggregate({
        where: { profileId: existingProfile.id },
        _max: { version: true },
      }))._max.version ?? 0
      : 0;
    if (operation.baseVersion !== undefined && operation.baseVersion !== currentVersion) {
      return conflict('VERSION_CONFLICT', { currentVersion });
    }
    const profile = existingProfile ?? await tx.measurementProfile.create({
      data: {
        id: operation.entityId,
        businessId,
        customerId: customer.id,
        garmentTemplateId: template.id,
      },
    });
    const revision = await tx.measurementRevision.create({
      data: {
        profileId: profile.id,
        version: currentVersion + 1,
        values: payload.values,
        notes: payload.notes,
        measuredAt: new Date(payload.measuredAt),
      },
    });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId,
        action: 'measurement.revision_created',
        entityType: 'measurement_revision',
        entityId: revision.id,
        metadata: { source: 'offline_sync', profileId: profile.id, version: revision.version },
        requestId,
      },
    });
    return { status: 'APPLIED', response: { profileId: profile.id, revisionId: revision.id, version: revision.version } };
  }

  if (operation.entityType !== 'order' || payload.action !== 'order.create') {
    throw new HttpError(400, 'Operation action and entity type do not match', 'INVALID_SYNC_OPERATION');
  }
  if (await tx.order.findFirst({ where: { id: operation.entityId, businessId }, select: { id: true, version: true } })) {
    return conflict('ORDER_ALREADY_EXISTS', { entityId: operation.entityId });
  }
  const input = payload.order;
  const customer = await tx.customer.findFirst({
    where: { id: input.customerId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) return conflict('CUSTOMER_NOT_FOUND', { customerId: input.customerId });
  let total = new Prisma.Decimal(0);
  const items = await Promise.all(input.items.map(async (item) => {
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    total = total.plus(unitPrice.mul(item.quantity));
    let measurementSnapshot: Prisma.InputJsonObject = {};
    if (item.measurementProfileId) {
      const profile = await tx.measurementProfile.findFirst({
        where: {
          id: item.measurementProfileId,
          businessId,
          customerId: input.customerId,
          garmentTemplate: { active: true },
        },
        include: {
          garmentTemplate: { select: { name: true } },
          revisions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
      const revision = profile?.revisions[0];
      if (!profile || !revision) return null;
      measurementSnapshot = {
        template: profile.garmentTemplate.name,
        revisionId: revision.id,
        revision: revision.version,
        measuredAt: revision.measuredAt.toISOString(),
        values: revision.values as Prisma.InputJsonObject,
      };
    }
    return { garmentName: item.garmentName, quantity: item.quantity, unitPrice, measurementSnapshot };
  }));
  if (items.some((item) => item === null)) return conflict('MEASUREMENT_PROFILE_NOT_FOUND');
  if (total.greaterThan(new Prisma.Decimal('9999999999.99'))) {
    throw new HttpError(400, 'Order total exceeds the supported amount', 'ORDER_TOTAL_TOO_LARGE');
  }
  const business = await tx.business.update({
    where: { id: businessId },
    data: { orderSequence: { increment: 1 } },
    select: { slug: true, orderSequence: true },
  });
  const prefix = business.slug.split('-')[0].slice(0, 8).toUpperCase();
  const orderNumber = `${prefix}-${String(business.orderSequence).padStart(6, '0')}`;
  const order = await tx.order.create({
    data: {
      id: operation.entityId,
      businessId,
      customerId: input.customerId,
      createdById: actorId,
      orderNumber,
      promisedAt: new Date(input.promisedAt),
      notes: input.notes,
      total,
      items: { create: items.filter((item) => item !== null) },
      statusHistory: { create: { toStatus: 'NEW', changedById: actorId } },
    },
    select: { id: true, orderNumber: true, version: true, updatedAt: true },
  });
  await tx.auditEvent.create({
    data: {
      businessId,
      actorId,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      metadata: { source: 'offline_sync', orderNumber: order.orderNumber, total: total.toFixed(2) },
      requestId,
    },
  });
  await queueOrderCreated(tx, order.id);
  return { status: 'APPLIED', response: order };
}

router.use(authenticate);

router.get('/changes', asyncHandler(async (req, res) => {
  const { businessId } = getBusinessContext(req);
  const query = changesQuerySchema.parse(req.query);
  const cursor = decodeCursor(query.cursor);
  const permissions = new Set(req.auth?.permissions ?? []);
  const [customerRows, orderRows, measurementRows] = await Promise.all([
    permissions.has('customers:read')
      ? prisma.customer.findMany({
        where: { businessId, ...cursorWhere(cursor.customers) },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      })
      : Promise.resolve([]),
    permissions.has('orders:read')
      ? prisma.order.findMany({
        where: { businessId, ...cursorOrderWhere(cursor.orders) },
        include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      })
      : Promise.resolve([]),
    permissions.has('measurements:read')
      ? prisma.measurementRevision.findMany({
        where: {
          ...cursorMeasurementWhere(cursor.measurements),
          profile: { is: { businessId } },
        },
        include: { profile: { include: { garmentTemplate: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
      })
      : Promise.resolve([]),
  ]);
  const customers = customerRows.slice(0, query.limit);
  const orders = orderRows.slice(0, query.limit);
  const measurements = measurementRows.slice(0, query.limit);
  const nextCursor: SyncCursor = {
    customers: nextEntry(customers, cursor.customers),
    orders: nextEntry(orders, cursor.orders),
    measurements: measurements.at(-1)
      ? { id: measurements.at(-1)!.id, at: measurements.at(-1)!.createdAt.toISOString() }
      : cursor.measurements ?? null,
  };
  const hasMore = {
    customers: customerRows.length > query.limit,
    orders: orderRows.length > query.limit,
    measurements: measurementRows.length > query.limit,
  };
  const cursorValue = Object.values(nextCursor).some(Boolean) ? encodeCursor(nextCursor) : null;
  res.json({
    data: {
      customers: { items: customers, hasMore: hasMore.customers },
      orders: { items: orders, hasMore: hasMore.orders },
      measurements: { items: measurements, hasMore: hasMore.measurements },
      nextCursor: cursorValue,
    },
  });
}));

router.post('/operations', asyncHandler(async (req, res) => {
  const { businessId, actorId } = getBusinessContext(req);
  const batch = batchSchema.parse(req.body);
  const permissions = new Set(req.auth?.permissions ?? []);
  if (new Set(batch.operations.map((operation) => operation.clientOperationId)).size !== batch.operations.length) {
    throw new HttpError(400, 'Each sync operation in a batch must have a unique operation ID', 'DUPLICATE_SYNC_OPERATION_ID');
  }
  const preparedOperations = batch.operations.map((operation) => {
    const payload = syncPayloadSchema.parse(operation.payload);
    const expectedType = payload.action.startsWith('customer.')
      ? 'customer'
      : payload.action === 'measurement.revision'
        ? 'measurement'
        : 'order';
    if (operation.entityType !== expectedType) {
      throw new HttpError(400, 'Operation action and entity type do not match', 'INVALID_SYNC_OPERATION');
    }
    const requiredPermission = expectedType === 'customer'
      ? 'customers:write'
      : expectedType === 'measurement'
        ? 'measurements:write'
        : 'orders:write';
    if (!permissions.has(requiredPermission)) {
      throw new HttpError(403, 'Permission is not granted', 'PERMISSION_DENIED');
    }
    return operation;
  });
  const writePermissions = new Set<string>();
  for (const operation of preparedOperations) {
    const payload = syncPayloadSchema.parse(operation.payload);
    const permission = payload.action.startsWith('customer.')
      ? 'customers:write'
      : payload.action === 'measurement.revision'
        ? 'measurements:write'
        : 'orders:write';
    writePermissions.add(permission);
  }
  for (const permission of writePermissions) {
    await assertSubscriptionAccess(businessId, permission, true);
  }
  const results: OperationResult[] = [];

  for (const operation of preparedOperations) {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.syncOperation.findUnique({
        where: { businessId_clientOperationId: { businessId, clientOperationId: operation.clientOperationId } },
      });
      if (existing) {
        if (stableJson(existing.request) !== stableJson(operation)) {
          throw new HttpError(409, 'Operation ID was already used for a different request', 'SYNC_OPERATION_ID_REUSED');
        }
        return {
          clientOperationId: operation.clientOperationId,
          status: existing.status,
          response: existing.response ?? {},
          duplicate: true,
        } satisfies OperationResult;
      }

      const payload = syncPayloadSchema.parse(operation.payload);
      if (payload.action === 'customer.create') await assertPlanLimit(tx, businessId, 'customers:write');
      if (payload.action === 'order.create') await assertPlanLimit(tx, businessId, 'orders:write');
      const applied = await applyOperation(tx, operation, businessId, actorId, req.requestId);
      const recorded = await tx.syncOperation.create({
        data: {
          businessId,
          userId: actorId,
          clientOperationId: operation.clientOperationId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          baseVersion: operation.baseVersion,
          status: applied.status,
          request: toJsonInput(operation),
          response: toJsonInput(applied.response),
        },
      });
      return {
        clientOperationId: operation.clientOperationId,
        status: recorded.status,
        response: recorded.response ?? {},
      } satisfies OperationResult;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    results.push(result);
  }

  res.json({ data: { results } });
}));

export default router;
