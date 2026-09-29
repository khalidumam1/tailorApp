import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { calculateNetPaid } from '../domain/finance.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

const router = express.Router();
const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});
const inProgressStatuses = ['CUTTING', 'STITCHING', 'FINISHING'] as const;

function getBusinessId(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function karachiDayRange(date = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new Error('Unable to calculate Asia/Karachi date range');
  const start = new Date(`${year}-${month}-${day}T00:00:00+05:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function paymentNet(
  totals: Array<{ kind: 'PAYMENT' | 'REVERSAL'; _sum: { amount: Prisma.Decimal | null } }>,
): Prisma.Decimal {
  return calculateNetPaid(totals.map((row) => ({
    kind: row.kind,
    amount: row._sum.amount ?? new Prisma.Decimal(0),
  })));
}

router.use(authenticate);

router.get('/dashboard', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const { start, end } = karachiDayRange();
  const canReadPayments = req.auth?.permissions.includes('payments:read') === true;

  const [
    newOrders,
    dueOrders,
    overdueOrders,
    inProgressOrders,
    openAlterations,
    orderTotals,
    paymentTotals,
    todayPaymentTotals,
  ] = await Promise.all([
    prisma.order.count({ where: { businessId, deletedAt: null, status: 'NEW', createdAt: { gte: start, lt: end } } }),
    prisma.order.count({ where: { businessId, deletedAt: null, status: { notIn: ['COLLECTED', 'CANCELLED'] }, promisedAt: { gte: start, lt: end } } }),
    prisma.order.count({ where: { businessId, deletedAt: null, status: { notIn: ['COLLECTED', 'CANCELLED'] }, promisedAt: { lt: start } } }),
    prisma.order.count({ where: { businessId, deletedAt: null, status: { in: [...inProgressStatuses] } } }),
    prisma.alterationTask.count({ where: { status: 'OPEN', order: { businessId, deletedAt: null } } }),
    canReadPayments
      ? prisma.order.aggregate({
        where: { businessId, deletedAt: null, status: { not: 'CANCELLED' } },
        _sum: { total: true },
      })
      : Promise.resolve(undefined),
    canReadPayments
      ? prisma.payment.groupBy({
        by: ['kind'],
        where: { businessId, order: { status: { not: 'CANCELLED' }, deletedAt: null } },
        _sum: { amount: true },
      })
      : Promise.resolve(undefined),
    canReadPayments
      ? prisma.payment.groupBy({
        by: ['kind'],
        where: { businessId, createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      })
      : Promise.resolve(undefined),
  ]);

  const allTimePaid = paymentTotals ? paymentNet(paymentTotals) : undefined;
  const collectedToday = todayPaymentTotals ? paymentNet(todayPaymentTotals) : undefined;
  const outstanding = orderTotals && allTimePaid
    ? new Prisma.Decimal(orderTotals._sum.total ?? 0).minus(allTimePaid)
    : undefined;

  res.json({
    data: {
      newOrders,
      dueToday: dueOrders,
      overdue: overdueOrders,
      inProgress: inProgressOrders,
      alterations: openAlterations,
      ...(outstanding ? { outstanding: outstanding.toFixed(2) } : {}),
      ...(collectedToday ? { collectedToday: collectedToday.toFixed(2) } : {}),
      asOf: new Date().toISOString(),
    },
  });
}));

router.get('/summary', requireBusinessPermission('reports:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const { from, to } = rangeSchema.parse(req.query);
  const start = new Date(from);
  const end = new Date(to);
  const rangeLength = end.getTime() - start.getTime();
  if (rangeLength <= 0 || rangeLength > 366 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'Report date range must be positive and no longer than 366 days', 'INVALID_REPORT_RANGE');
  }
  const [orders, payments] = await Promise.all([
    prisma.order.aggregate({
      where: { businessId, deletedAt: null, createdAt: { gte: start, lt: end } },
      _count: { id: true },
      _sum: { total: true },
    }),
    prisma.payment.groupBy({
      by: ['kind', 'method'],
      where: { businessId, createdAt: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);
  const net = paymentNet(payments);
  res.json({
    data: {
      from: start.toISOString(),
      to: end.toISOString(),
      orders: { count: orders._count.id, total: new Prisma.Decimal(orders._sum.total ?? 0).toFixed(2) },
      collections: {
        net: net.toFixed(2),
        entries: payments.reduce((sum, entry) => sum + entry._count.id, 0),
        byMethod: payments.map((entry) => ({
          kind: entry.kind,
          method: entry.method,
          amount: (entry._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
          count: entry._count.id,
        })),
      },
    },
  });
}));

export default router;
