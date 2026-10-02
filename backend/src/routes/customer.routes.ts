import { Prisma } from '@prisma/client';
import express from 'express';
import { createCustomerSchema, customerQuerySchema, normalizePakistanPhone, toE164Phone, updateCustomerSchema } from '@tailor/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

const router = express.Router();
const customerIdSchema = z.string().uuid();
const duplicateQuerySchema = z.object({ phone: createCustomerSchema.shape.phone });
const deleteSchema = z.object({ version: z.number().int().positive() });
const whatsappConsentSchema = z.object({
  consented: z.boolean(),
  version: z.number().int().positive(),
});

function getBusinessId(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function getActorId(req: express.Request): string {
  if (!req.auth) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
  return req.auth.userId;
}

function handleDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'A customer with this phone number already exists', 'DUPLICATE_CUSTOMER');
  }
  throw error;
}

router.use(authenticate);

router.get('/', requireBusinessPermission('customers:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const query = customerQuerySchema.parse(req.query);
  if (query.cursor) {
    const cursorExists = await prisma.customer.findFirst({
      where: { id: query.cursor, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!cursorExists) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }

  const search = query.q;
  const digits = search ? normalizePakistanPhone(search) : '';
  const items = await prisma.customer.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          ...(digits ? [{ phoneNormalized: { contains: digits } }] : []),
        ],
      } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = items.length > query.limit;
  const page = hasMore ? items.slice(0, query.limit) : items;
  res.json({
    data: {
      items: page,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    },
  });
}));

router.get('/duplicate-check', requireBusinessPermission('customers:read'), asyncHandler(async (req, res) => {
  const { phone } = duplicateQuerySchema.parse(req.query);
  const customer = await prisma.customer.findFirst({
    where: { businessId: getBusinessId(req), phoneNormalized: normalizePakistanPhone(phone), deletedAt: null },
    select: { id: true, name: true, phone: true },
  });
  res.json({ data: { duplicate: Boolean(customer), customer } });
}));

router.post('/', requireBusinessPermission('customers:write'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const input = createCustomerSchema.parse(req.body);
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          businessId,
          name: input.name,
          phone: toE164Phone(input.phone),
          phoneNormalized: normalizePakistanPhone(input.phone),
          notes: input.notes,
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: getActorId(req),
          action: 'customer.created',
          entityType: 'customer',
          entityId: created.id,
          metadata: {},
          requestId: req.requestId,
        },
      });
      return created;
    });
    res.status(201).json({ data: customer });
  } catch (error) {
    handleDuplicate(error);
  }
}));

router.get('/:customerId', requireBusinessPermission('customers:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const customerId = customerIdSchema.parse(req.params.customerId);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
  });
  if (!customer) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');

  const [orders, measurements] = await Promise.all([
    req.auth?.permissions.includes('orders:read')
      ? prisma.order.findMany({
        where: { businessId, customerId, deletedAt: null },
        select: { id: true, orderNumber: true, status: true, promisedAt: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      : Promise.resolve(undefined),
    req.auth?.permissions.includes('measurements:read')
      ? prisma.measurementProfile.findMany({
        where: { businessId, customerId },
        include: { garmentTemplate: { select: { id: true, name: true } }, revisions: { orderBy: { version: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      })
      : Promise.resolve(undefined),
  ]);
  res.json({ data: { customer, ...(orders ? { orders } : {}), ...(measurements ? { measurements } : {}) } });
}));

router.patch('/:customerId', requireBusinessPermission('customers:write'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const customerId = customerIdSchema.parse(req.params.customerId);
  const input = updateCustomerSchema.parse(req.body);
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { id: customerId, businessId, deletedAt: null },
        select: { phoneNormalized: true },
      });
      const phoneChanged = input.phone !== undefined
        && existing?.phoneNormalized !== normalizePakistanPhone(input.phone);
      const update = await tx.customer.updateMany({
        where: { id: customerId, businessId, deletedAt: null, version: input.version },
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
      if (!update.count) {
        const exists = await tx.customer.findFirst({ where: { id: customerId, businessId, deletedAt: null }, select: { id: true } });
        if (!exists) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
        throw new HttpError(409, 'Customer changed since it was loaded; refresh before editing', 'VERSION_CONFLICT');
      }
      if (phoneChanged) {
        await tx.whatsAppNotification.updateMany({
          where: { businessId, customerId, status: 'QUEUED' },
          data: { status: 'NOT_SENT', lastError: 'Customer phone number changed before delivery', failedAt: new Date() },
        });
      }
      const updated = await tx.customer.findFirstOrThrow({ where: { id: customerId, businessId } });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: getActorId(req),
          action: 'customer.updated',
          entityType: 'customer',
          entityId: customerId,
          metadata: { version: updated.version, phoneChanged },
          requestId: req.requestId,
        },
      });
      return updated;
    });
    res.json({ data: customer });
  } catch (error) {
    handleDuplicate(error);
  }
}));

router.post('/:customerId/whatsapp-consent', requireBusinessPermission('customers:write'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const customerId = customerIdSchema.parse(req.params.customerId);
  const input = whatsappConsentSchema.parse(req.body);
  const now = new Date();
  const customer = await prisma.$transaction(async (tx) => {
    const update = await tx.customer.updateMany({
      where: { id: customerId, businessId, deletedAt: null, version: input.version },
      data: {
        whatsappConsent: input.consented,
        ...(input.consented
          ? { whatsappConsentAt: now, whatsappOptedOutAt: null }
          : { whatsappOptedOutAt: now }),
        version: { increment: 1 },
      },
    });
    if (!update.count) {
      const exists = await tx.customer.findFirst({ where: { id: customerId, businessId, deletedAt: null }, select: { id: true } });
      if (!exists) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
      throw new HttpError(409, 'Customer changed since it was loaded; refresh before updating', 'VERSION_CONFLICT');
    }
    if (!input.consented) {
      await tx.whatsAppNotification.updateMany({
        where: { businessId, customerId, status: 'QUEUED' },
        data: { status: 'NOT_SENT', lastError: 'Customer opted out', failedAt: now },
      });
    }
    const updated = await tx.customer.findFirstOrThrow({ where: { id: customerId, businessId } });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId: getActorId(req),
        action: input.consented ? 'customer.whatsapp_consented' : 'customer.whatsapp_opted_out',
        entityType: 'customer',
        entityId: customerId,
        metadata: { source: 'business_user' },
        requestId: req.requestId,
      },
    });
    return updated;
  });
  res.json({ data: customer });
}));

router.delete('/:customerId', requireBusinessPermission('customers:write'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const customerId = customerIdSchema.parse(req.params.customerId);
  const { version } = deleteSchema.parse(req.body);
  await prisma.$transaction(async (tx) => {
    const result = await tx.customer.updateMany({
      where: { id: customerId, businessId, deletedAt: null, version },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (!result.count) {
      const exists = await tx.customer.findFirst({ where: { id: customerId, businessId, deletedAt: null }, select: { id: true } });
      if (!exists) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
      throw new HttpError(409, 'Customer changed since it was loaded; refresh before deleting', 'VERSION_CONFLICT');
    }
    await tx.whatsAppNotification.updateMany({
      where: { businessId, customerId, status: 'QUEUED' },
      data: { status: 'NOT_SENT', lastError: 'Customer record was archived', failedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId: getActorId(req),
        action: 'customer.archived',
        entityType: 'customer',
        entityId: customerId,
        metadata: { version },
        requestId: req.requestId,
      },
    });
  });
  res.json({ data: { archived: true } });
}));

export default router;
