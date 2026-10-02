import { Prisma } from '@prisma/client';
import express from 'express';
import {
  createAlterationSchema,
  createOrderSchema,
  orderQuerySchema,
  transitionOrderSchema,
} from '@tailor/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { calculateNetPaid, calculateOutstanding } from '../domain/finance.js';
import { isAllowedOrderTransition } from '../domain/orders.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { assertPlanLimit } from '../plan-limits.js';
import { queueOrderCreated, queueOrderReady } from '../whatsapp.js';

const router = express.Router();
const idSchema = z.string().uuid();

function getContext(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function mapOrderWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    throw new HttpError(409, 'Order changed concurrently; refresh and retry', 'VERSION_CONFLICT');
  }
  throw error;
}

router.use(authenticate);

router.get('/', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const query = orderQuerySchema.parse(req.query);
  if (query.cursor) {
    const cursorExists = await prisma.order.findFirst({
      where: { id: query.cursor, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!cursorExists) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }

  const orders = await prisma.order.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? {
        OR: [
          { orderNumber: { contains: query.q, mode: 'insensitive' } },
          { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      } : {}),
      ...(query.dueBefore || query.dueAfter ? {
        promisedAt: {
          ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
          ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
        },
      } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = orders.length > query.limit;
  const page = hasMore ? orders.slice(0, query.limit) : orders;
  const paymentTotals = page.length ? await prisma.payment.groupBy({
    by: ['orderId', 'kind'],
    where: { businessId, orderId: { in: page.map((order) => order.id) } },
    _sum: { amount: true },
  }) : [];

  const items = page.map((order) => {
    const payments = paymentTotals
      .filter((payment) => payment.orderId === order.id)
      .map((payment) => ({ kind: payment.kind, amount: payment._sum.amount ?? new Prisma.Decimal(0) }));
    const paid = calculateNetPaid(payments);
    return {
      ...order,
      paid: paid.toFixed(2),
      outstanding: calculateOutstanding(order.total, payments).toFixed(2),
    };
  });
  res.json({ data: { items, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
}));

router.post('/', requireBusinessPermission('orders:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const input = createOrderSchema.parse(req.body);
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');

  let total = new Prisma.Decimal(0);
  const items = await Promise.all(input.items.map(async (item) => {
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    total = total.plus(unitPrice.mul(item.quantity));
    let measurementSnapshot: Prisma.InputJsonObject = {};
    if (item.measurementProfileId) {
      const profile = await prisma.measurementProfile.findFirst({
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
      if (!profile || !revision) {
        throw new HttpError(404, 'A current measurement profile was not found for this customer', 'MEASUREMENT_PROFILE_NOT_FOUND');
      }
      measurementSnapshot = {
        template: profile.garmentTemplate.name,
        revisionId: revision.id,
        revision: revision.version,
        measuredAt: revision.measuredAt.toISOString(),
        values: revision.values as Prisma.InputJsonObject,
      };
    }
    return {
      garmentName: item.garmentName,
      quantity: item.quantity,
      unitPrice,
      measurementSnapshot,
    };
  }));

  if (total.greaterThan(new Prisma.Decimal('9999999999.99'))) {
    throw new HttpError(400, 'Order total exceeds the supported amount', 'ORDER_TOTAL_TOO_LARGE');
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      await assertPlanLimit(tx, businessId, 'orders:write');
      const business = await tx.business.update({
        where: { id: businessId },
        data: { orderSequence: { increment: 1 } },
        select: { slug: true, orderSequence: true },
      });
      const prefix = business.slug.split('-')[0].slice(0, 8).toUpperCase();
      const orderNumber = `${prefix}-${String(business.orderSequence).padStart(6, '0')}`;
      const created = await tx.order.create({
        data: {
          businessId,
          customerId: input.customerId,
          createdById: actorId,
          orderNumber,
          promisedAt: new Date(input.promisedAt),
          notes: input.notes,
          total,
          items: { create: items },
          statusHistory: { create: { fromStatus: null, toStatus: 'NEW', changedById: actorId } },
        },
        include: { customer: { select: { id: true, name: true, phone: true } }, items: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'order.created',
          entityType: 'order',
          entityId: created.id,
          metadata: { orderNumber: created.orderNumber, total: total.toFixed(2) },
          requestId: req.requestId,
        },
      });
      await queueOrderCreated(tx, created.id);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ data: order });
  } catch (error) {
    mapOrderWriteError(error);
  }
}));

router.post('/:orderId/status', requireBusinessPermission('orders:transition'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const input = transitionOrderSchema.parse(req.body);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    select: { id: true, status: true, version: true },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (order.version !== input.version) {
    throw new HttpError(409, 'Order changed since it was loaded; refresh before updating', 'VERSION_CONFLICT');
  }
  if (!isAllowedOrderTransition(order.status, input.toStatus)) {
    throw new HttpError(409, `Cannot transition order from ${order.status} to ${input.toStatus}`, 'INVALID_STATUS_TRANSITION');
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: order.id, businessId, status: order.status, version: input.version, deletedAt: null },
        data: { status: input.toStatus, version: { increment: 1 } },
      });
      if (!result.count) throw new HttpError(409, 'Order changed concurrently; refresh and retry', 'VERSION_CONFLICT');
      const next = await tx.order.findFirstOrThrow({ where: { id: order.id, businessId } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: input.toStatus,
          changedById: actorId,
          note: input.note,
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'order.status_changed',
          entityType: 'order',
          entityId: order.id,
          metadata: { from: order.status, to: input.toStatus },
          requestId: req.requestId,
        },
      });
      if (input.toStatus === 'READY_FOR_PICKUP') await queueOrderReady(tx, order.id);
      return next;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json({ data: updated });
  } catch (error) {
    mapOrderWriteError(error);
  }
}));

router.post('/:orderId/alterations', requireBusinessPermission('orders:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const input = createAlterationSchema.parse(req.body);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null, status: { not: 'CANCELLED' } },
    select: { id: true },
  });
  if (!order) throw new HttpError(404, 'Active order not found', 'ORDER_NOT_FOUND');
  const alteration = await prisma.$transaction(async (tx) => {
    const created = await tx.alterationTask.create({
      data: {
        orderId,
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId,
        action: 'alteration.created',
        entityType: 'alteration',
        entityId: created.id,
        metadata: { orderId },
        requestId: req.requestId,
      },
    });
    return created;
  });
  res.status(201).json({ data: alteration });
}));

router.get('/:orderId', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      alterations: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  const totalPaid = calculateNetPaid(order.payments);
  res.json({
    data: {
      ...order,
      paid: totalPaid.toFixed(2),
      outstanding: calculateOutstanding(order.total, order.payments).toFixed(2),
    },
  });
}));

export default router;
