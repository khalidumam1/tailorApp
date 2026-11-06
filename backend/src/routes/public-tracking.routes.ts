/**
 * Public customer order-tracking endpoints.
 *
 * These routes are unauthenticated on purpose: the customer following an
 * order has no account. The only credential is the random token in the link,
 * which:
 *   - is never guessable (24 random bytes),
 *   - is scoped to exactly one order,
 *   - stops working the moment the shop revokes it,
 *   - exposes nothing but that one order's own progress, items, totals and
 *     the customer's own measurements.
 *
 * Every response is deliberately narrow: no internal notes, no staff names,
 * no cost or margin data, no other customer, no other order.
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { customerMessageInputSchema, orderTrackingTokenSchema } from '@tailor/shared/tracking';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { calculateNetPaid, calculateOutstanding } from '../domain/finance.js';
import {
  buildTrackingTimeline,
  customerDisplayName,
  measurementSummary,
  orderStatusLabel,
} from '../domain/order-tracking.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = express.Router();

// The token is unguessable, so this limiter exists to stop a script from
// hammering the endpoint, not to protect the token itself.
const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests; please try again later' },
    requestId: req.requestId,
  }),
});

router.use(trackingLimiter);

const messageSchema = customerMessageInputSchema.superRefine((value, context) => {
  // A question or a change request without words cannot be answered, so it
  // is rejected up front instead of reaching the shop as an empty message.
  if (value.kind !== 'FITTING_CONFIRMED' && !value.body) {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Please write your message before sending it',
    });
  }
});

/** Loads the order behind a tracking token, or fails with a generic 404. */
async function loadTrackedOrder(rawToken: string) {
  const parsed = orderTrackingTokenSchema.safeParse(rawToken);
  if (!parsed.success) {
    throw new HttpError(404, 'This tracking link is not valid', 'TRACKING_LINK_NOT_FOUND');
  }
  const link = await prisma.orderTrackingLink.findUnique({
    where: { token: parsed.data },
    include: {
      order: {
        include: {
          customer: { select: { name: true } },
          items: true,
          currentWorkflowStage: { select: { label: true, key: true } },
          workflowHistory: { orderBy: { createdAt: 'asc' }, select: { toStageLabel: true, createdAt: true } },
          statusHistory: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
          business: { select: { name: true, logoUrl: true, currency: true } },
        },
      },
    },
  });
  if (!link || link.revokedAt || link.order.deletedAt) {
    throw new HttpError(404, 'This tracking link is not valid', 'TRACKING_LINK_NOT_FOUND');
  }
  return link;
}

router.get('/:token', asyncHandler(async (req, res) => {
  const link = await loadTrackedOrder(req.params.token);
  const { order } = link;
  const payments = await prisma.payment.findMany({
    where: { businessId: order.businessId, orderId: order.id },
    orderBy: { createdAt: 'asc' },
    select: { kind: true, amount: true },
  });
  const paid = calculateNetPaid(payments.map((payment) => ({
    kind: payment.kind,
    amount: payment.amount,
  })));
  const configuration = await prisma.businessConfiguration.findUnique({
    where: { businessId: order.businessId },
    select: { contactPhone: true },
  });
  const messages = await prisma.orderCustomerMessage.findMany({
    where: { businessId: order.businessId, orderId: order.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, body: true, status: true, createdAt: true },
  });

  // Count the view, but never let a failed counter break the customer's page.
  await prisma.orderTrackingLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  }).catch(() => undefined);

  const stageKey = order.currentWorkflowStage?.key ?? '';
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    data: {
      business: {
        name: order.business.name,
        logoUrl: order.business.logoUrl,
        contactPhone: configuration?.contactPhone ?? null,
        currency: order.business.currency,
      },
      customerName: customerDisplayName(order.customer.name),
      order: {
        orderNumber: order.orderNumber,
        statusLabel: order.currentWorkflowStage?.label ?? orderStatusLabel(order.status),
        stageLabel: order.currentWorkflowStage?.label ?? null,
        promisedAt: order.promisedAt.toISOString(),
        createdAt: order.createdAt.toISOString(),
        total: order.total.toFixed(2),
        paid: paid.toFixed(2),
        outstanding: calculateOutstanding(order.total, payments.map((payment) => ({
          kind: payment.kind,
          amount: payment.amount,
        }))).toFixed(2),
        currency: order.business.currency,
        ready: order.status === 'READY_FOR_PICKUP' || order.status === 'COLLECTED'
          || stageKey.toLowerCase().includes('ready'),
        items: order.items.map((item) => ({
          name: item.itemName ?? item.garmentName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          measurements: measurementSummary(item.measurementSnapshot),
        })),
        timeline: buildTrackingTimeline(order),
        messages: messages.map((message) => ({
          id: message.id,
          kind: message.kind,
          body: message.body,
          status: message.status,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    },
  });
}));

router.post('/:token/messages', asyncHandler(async (req, res) => {
  const link = await loadTrackedOrder(req.params.token);
  const input = messageSchema.parse(req.body ?? {});
  const message = await prisma.orderCustomerMessage.create({
    data: {
      businessId: link.order.businessId,
      orderId: link.order.id,
      linkId: link.id,
      kind: input.kind,
      body: input.body ?? null,
    },
    select: { id: true, kind: true, body: true, status: true, createdAt: true },
  });
  res.status(201).json({
    data: {
      message: {
        id: message.id,
        kind: message.kind,
        body: message.body,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      },
    },
  });
}));

export default router;
