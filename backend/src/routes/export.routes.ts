import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { toCsv } from '../csv.js';
import { businessDateBounds, businessLocalDateString } from '../domain/business-time.js';
import { calculateNetPaid, calculateOutstanding } from '../domain/finance.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

/**
 * Business CSV exports (Phase 2 task 2.2, F-007). Every export is scoped to
 * the authenticated tenant, gated by the same read permission as the
 * corresponding screen; requireBusinessPermission also enforces the
 * matching module gate (payments/cashbook/...), so exporting can never
 * become a side door around either check.
 * Dates are business-local (tenant timezone) and ranges are inclusive
 * YYYY-MM-DD days in that timezone. Rows are capped; a capped export says
 * so via the X-Export-Truncated header instead of silently dropping data.
 */
const router = express.Router();
router.use(authenticate);

const EXPORT_ROW_CAP = 5000;

const exportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  archived: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

function getBusinessId(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function businessTimezone(req: express.Request): string {
  return req.auth?.business?.timezone ?? 'Asia/Karachi';
}

function sendCsv(res: express.Response, filename: string, rows: readonly (readonly unknown[])[], truncated: boolean): void {
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  if (truncated) res.setHeader('x-export-truncated', 'true');
  res.send(toCsv(rows));
}

router.get('/customers.csv', requireBusinessPermission('customers:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const timezone = businessTimezone(req);
  const query = exportQuerySchema.parse(req.query);
  const range = businessDateBounds({ from: query.from, to: query.to, timezone });
  const customers = await prisma.customer.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(range.gte || range.lte ? { createdAt: range } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_ROW_CAP + 1,
  });
  const truncated = customers.length > EXPORT_ROW_CAP;
  const rows = [
    ['Name', 'Phone', 'WhatsApp consent', 'Notes', 'Customer since'],
    ...customers.slice(0, EXPORT_ROW_CAP).map((customer) => [
      customer.name,
      customer.phone,
      customer.whatsappConsent ? 'Yes' : 'No',
      customer.notes ?? '',
      businessLocalDateString(timezone, customer.createdAt),
    ]),
  ];
  sendCsv(res, 'customers.csv', rows, truncated);
}));

router.get('/orders.csv', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const timezone = businessTimezone(req);
  const query = exportQuerySchema.parse(req.query);
  const range = businessDateBounds({ from: query.from, to: query.to, timezone });
  const orders = await prisma.order.findMany({
    where: {
      businessId,
      deletedAt: query.archived ? { not: null } : null,
      ...(range.gte || range.lte ? { createdAt: range } : {}),
    },
    include: {
      customer: { select: { name: true, phone: true } },
      items: { select: { itemName: true, garmentName: true } },
      currentWorkflowStage: { select: { label: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_ROW_CAP + 1,
  });
  const truncated = orders.length > EXPORT_ROW_CAP;
  const page = orders.slice(0, EXPORT_ROW_CAP);
  const totals = await prisma.payment.groupBy({
    by: ['orderId', 'kind'],
    where: { businessId, orderId: { in: page.map((order) => order.id) } },
    _sum: { amount: true },
  });
  const rows = [
    ['Order', 'Customer', 'Phone', 'Status', 'Stage', 'Promised', 'Items', 'Total', 'Paid', 'Outstanding', 'Created', 'Archived'],
    ...page.map((order) => {
      const entries = totals
        .filter((row) => row.orderId === order.id)
        .map((row) => ({ kind: row.kind, amount: row._sum.amount ?? 0 }));
      const paid = calculateNetPaid(entries);
      return [
        order.orderNumber,
        order.customer.name,
        order.customer.phone,
        order.status,
        order.currentWorkflowStage?.label ?? order.workflowStageKey ?? '',
        businessLocalDateString(timezone, order.promisedAt),
        order.items.map((item) => item.itemName ?? item.garmentName ?? 'Item').join('; '),
        order.total.toFixed(2),
        paid.toFixed(2),
        calculateOutstanding(order.total, entries).toFixed(2),
        businessLocalDateString(timezone, order.createdAt),
        order.deletedAt ? 'Yes' : 'No',
      ];
    }),
  ];
  sendCsv(res, 'orders.csv', rows, truncated);
}));

router.get('/payments.csv', requireBusinessPermission('payments:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const timezone = businessTimezone(req);
  const query = exportQuerySchema.parse(req.query);
  const range = businessDateBounds({ from: query.from, to: query.to, timezone });
  const payments = await prisma.payment.findMany({
    where: {
      businessId,
      ...(range.gte || range.lte ? { createdAt: range } : {}),
    },
    include: { order: { select: { orderNumber: true, customer: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_ROW_CAP + 1,
  });
  const truncated = payments.length > EXPORT_ROW_CAP;
  const rows = [
    ['Receipt', 'Order', 'Customer', 'Kind', 'Method', 'Amount', 'Date'],
    ...payments.slice(0, EXPORT_ROW_CAP).map((payment) => [
      payment.receiptNumber,
      payment.order.orderNumber,
      payment.order.customer.name,
      payment.kind,
      payment.method,
      payment.amount.toFixed(2),
      businessLocalDateString(timezone, payment.createdAt),
    ]),
  ];
  sendCsv(res, 'payments.csv', rows, truncated);
}));

router.get('/ledger.csv', requireBusinessPermission('cashbook:read'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const timezone = businessTimezone(req);
  const query = exportQuerySchema.parse(req.query);
  const range = businessDateBounds({ from: query.from, to: query.to, timezone });
  const transactions = await prisma.cashTransaction.findMany({
    where: {
      businessId,
      ...(range.gte || range.lte ? { occurredAt: range } : {}),
    },
    include: {
      financialAccount: { select: { name: true } },
      contraAccount: { select: { name: true } },
    },
    orderBy: { occurredAt: 'asc' },
    take: EXPORT_ROW_CAP + 1,
  });
  const truncated = transactions.length > EXPORT_ROW_CAP;
  const rows = [
    ['Date', 'Kind', 'Account', 'Contra account', 'Amount', 'Reference', 'Memo'],
    ...transactions.slice(0, EXPORT_ROW_CAP).map((transaction) => [
      businessLocalDateString(timezone, transaction.occurredAt),
      transaction.kind,
      transaction.financialAccount.name,
      transaction.contraAccount.name,
      transaction.amount.toFixed(2),
      transaction.reference ?? '',
      transaction.memo,
    ]),
  ];
  sendCsv(res, 'ledger.csv', rows, truncated);
}));

export default router;
