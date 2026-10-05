import { Prisma, type CustomFieldDefinition } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { customFieldValueData, validateCustomFieldValues } from '../domain/custom-fields.js';

const router = express.Router();
const itemIdSchema = z.string().uuid();
const keySchema = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const priceSchema = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const itemInputSchema = z.object({
  typeKey: keySchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().min(1).max(40).default('unit'),
  unitPrice: priceSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  customFields: z.record(z.string(), z.unknown()).default({}),
}).strict();
const itemUpdateSchema = z.object({
  version: z.number().int().positive(),
  typeKey: keySchema.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  unitPrice: priceSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'version'), 'Provide at least one catalog change');
const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  typeKey: keySchema.optional(),
  includeInactive: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  cursor: itemIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function businessIdFrom(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function itemTypeKeys(value: Prisma.JsonValue): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.flatMap((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)
      && 'key' in item && typeof item.key === 'string') return [item.key];
    return [];
  }));
}

async function itemFieldDefinitions(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<{ fields: CustomFieldDefinition[]; itemTypes: Set<string> }> {
  const business = await tx.business.findUnique({
    where: { id: businessId },
    include: {
      configuration: true,
      template: { include: { fields: { where: { active: true, module: 'catalog' } } } },
      customFields: { where: { active: true, module: 'catalog' } },
    },
  });
  if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  if (!business.template) throw new HttpError(409, 'Business has no assigned template', 'BUSINESS_TEMPLATE_MISSING');
  const modules = business.configuration?.enabledModules ?? business.template.enabledModules;
  if (!modules.includes('catalog')) {
    throw new HttpError(403, 'The catalog module is disabled for this business', 'BUSINESS_MODULE_DISABLED');
  }
  const byKey = new Map<string, CustomFieldDefinition>();
  for (const field of business.template.fields) {
    if (['item', 'catalog-item'].includes(field.screen)) byKey.set(field.key, field);
  }
  for (const field of business.customFields) {
    if (['item', 'catalog-item'].includes(field.screen)) byKey.set(field.key, field);
  }
  return { fields: [...byKey.values()], itemTypes: itemTypeKeys(business.template.itemTypes) };
}

function valueMap(item: {
  customFieldValues: Array<{
    fieldDefinition: { key: string };
    valueText: string | null;
    valueNumber: Prisma.Decimal | null;
    valueBoolean: boolean | null;
    valueDate: Date | null;
    valueJson: Prisma.JsonValue | null;
  }>;
}) {
  return Object.fromEntries(item.customFieldValues.map((entry) => [
    entry.fieldDefinition.key,
    entry.valueText
      ?? entry.valueNumber?.toString()
      ?? entry.valueBoolean
      ?? entry.valueDate?.toISOString()
      ?? entry.valueJson,
  ]));
}

function serializeItem<T extends { customFieldValues: Parameters<typeof valueMap>[0]['customFieldValues'] }>(item: T) {
  const customFields = valueMap(item);
  const { customFieldValues: _values, ...data } = item;
  return { ...data, customFields };
}

function assertItemType(itemTypes: Set<string>, typeKey: string): void {
  if (!itemTypes.has(typeKey)) {
    throw new HttpError(400, 'Item type is not available in this business template', 'INVALID_ITEM_TYPE');
  }
}

function mapUniqueError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'A catalog item with this name or code already exists', 'DUPLICATE_CATALOG_ITEM');
  }
  throw error;
}

router.use(authenticate);

router.get('/', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const businessId = businessIdFrom(req);
  const query = listQuerySchema.parse(req.query);
  await itemFieldDefinitions(prisma, businessId);
  if (query.cursor) {
    const cursorExists = await prisma.businessItem.findFirst({
      where: { id: query.cursor, businessId },
      select: { id: true },
    });
    if (!cursorExists) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const results = await prisma.businessItem.findMany({
    where: {
      businessId,
      ...(query.includeInactive ? {} : { active: true }),
      ...(query.typeKey ? { typeKey: query.typeKey } : {}),
      ...(query.q ? {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: { customFieldValues: { include: { fieldDefinition: { select: { key: true } } } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = results.length > query.limit;
  const items = (hasMore ? results.slice(0, query.limit) : results).map(serializeItem);
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

router.post('/', requireBusinessPermission('settings:manage'), asyncHandler(async (req, res) => {
  const businessId = businessIdFrom(req);
  const input = itemInputSchema.parse(req.body);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const { fields, itemTypes } = await itemFieldDefinitions(tx, businessId);
      assertItemType(itemTypes, input.typeKey);
      const customValues = validateCustomFieldValues(fields, input.customFields, { itemTypeKey: input.typeKey });
      const item = await tx.businessItem.create({
        data: {
          businessId,
          typeKey: input.typeKey,
          name: input.name,
          description: input.description,
          sku: input.sku,
          unit: input.unit,
          unitPrice: input.unitPrice ? new Prisma.Decimal(input.unitPrice) : null,
          sortOrder: input.sortOrder,
        },
      });
      if (customValues.length) {
        await tx.customFieldValue.createMany({
          data: customValues.map((value) => ({
            businessId,
            itemId: item.id,
            ...customFieldValueData(value),
          })),
        });
      }
      const serialized = await tx.businessItem.findFirstOrThrow({
        where: { id: item.id, businessId },
        include: { customFieldValues: { include: { fieldDefinition: { select: { key: true } } } } },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: req.auth!.userId,
          action: 'catalog_item.created',
          entityType: 'business_item',
          entityId: item.id,
          metadata: { typeKey: item.typeKey, name: item.name },
          requestId: req.requestId,
        },
      });
      return serialized;
    });
    res.status(201).json({ data: serializeItem(created) });
  } catch (error) {
    mapUniqueError(error);
  }
}));

router.patch('/:itemId', requireBusinessPermission('settings:manage'), asyncHandler(async (req, res) => {
  const businessId = businessIdFrom(req);
  const itemId = itemIdSchema.parse(req.params.itemId);
  const input = itemUpdateSchema.parse(req.body);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.businessItem.findFirst({
        where: { id: itemId, businessId },
        include: { customFieldValues: { include: { fieldDefinition: { select: { key: true } } } } },
      });
      if (!existing) throw new HttpError(404, 'Catalog item not found', 'CATALOG_ITEM_NOT_FOUND');
      if (existing.version !== input.version) {
        throw new HttpError(409, 'Catalog item changed since it was loaded; refresh before updating', 'VERSION_CONFLICT');
      }
      const { fields, itemTypes } = await itemFieldDefinitions(tx, businessId);
      const typeKey = input.typeKey ?? existing.typeKey;
      assertItemType(itemTypes, typeKey);
      const activeFieldKeys = new Set(fields.map((field) => field.key));
      const values = input.customFields === undefined
        ? undefined
        : validateCustomFieldValues(
          fields,
          {
            ...Object.fromEntries(Object.entries(valueMap(existing)).filter(([key]) => activeFieldKeys.has(key))),
            ...input.customFields,
          },
          { itemTypeKey: typeKey },
        );
      const data: Prisma.BusinessItemUpdateManyMutationInput = {
        ...(input.typeKey !== undefined ? { typeKey } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice === null ? null : new Prisma.Decimal(input.unitPrice) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        version: { increment: 1 },
      };
      const result = await tx.businessItem.updateMany({
        where: { id: itemId, businessId, version: input.version },
        data,
      });
      if (result.count !== 1) throw new HttpError(409, 'Catalog item changed concurrently; refresh before updating', 'VERSION_CONFLICT');
      if (values) {
        await tx.customFieldValue.deleteMany({ where: { businessId, itemId } });
        if (values.length) {
          await tx.customFieldValue.createMany({
            data: values.map((value) => ({ businessId, itemId, ...customFieldValueData(value) })),
          });
        }
      }
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: req.auth!.userId,
          action: input.active === false ? 'catalog_item.deactivated' : 'catalog_item.updated',
          entityType: 'business_item',
          entityId: itemId,
          metadata: { changedKeys: Object.keys(input).filter((key) => key !== 'version') },
          requestId: req.requestId,
        },
      });
      return tx.businessItem.findFirstOrThrow({
        where: { id: itemId, businessId },
        include: { customFieldValues: { include: { fieldDefinition: { select: { key: true } } } } },
      });
    });
    res.json({ data: serializeItem(updated) });
  } catch (error) {
    mapUniqueError(error);
  }
}));

export default router;
