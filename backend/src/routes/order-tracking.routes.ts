/**
 * Business-side routes for customer order-tracking links.
 *
 * Staff create, share and revoke the link; they also read and resolve the
 * messages customers leave through it. Every route is tenant-scoped: the
 * order must belong to the caller's business, so a link can never expose or
 * accept messages for another tenant's work.
 */
import { Prisma } from '@prisma/client';
import { uuidSchema } from '@tailor/shared';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import {
  generateTrackingToken,
  trackingPath,
  trackingUrl,
} from '../domain/order-tracking.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

const router = express.Router();
// The shared uuid shape: zod 4's `z.string().uuid()` rejects the deterministic
// ids some older rows carry, so the codebase validates the shape alone.
const idSchema = uuidSchema;

const createLinkSchema = z.object({
  // Rotating issues a fresh token, which instantly invalidates the link the
  // customer already has (used when a link leaked).
  regenerate: z.boolean().optional(),
}).strict();

const messageStatusSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED']),
}).strict();

function getContext(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function linkPayload(link: {
  id: string;
  token: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastViewedAt: Date | null;
  viewCount: number;
}): {
  id: string;
  token: string;
  path: string;
  url: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
} {
  return {
    id: link.id,
    token: link.token,
    path: trackingPath(link.token),
    url: trackingUrl(link.token),
    createdAt: link.createdAt.toISOString(),
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
    lastViewedAt: link.lastViewedAt ? link.lastViewedAt.toISOString() : null,
    viewCount: link.viewCount,
  };
}

/** The order must exist in this tenant and must not be archived. */
async function loadOrder(businessId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    select: { id: true, orderNumber: true, customer: { select: { name: true } } },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  return order;
}

// `authenticate` runs per route, not with `router.use`: this router is
// mounted in front of the order routes, so a router-wide middleware would
// authenticate every order request twice.
router.get('/:orderId/tracking-link', authenticate, requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  await loadOrder(businessId, orderId);
  const link = await prisma.orderTrackingLink.findUnique({
    where: { orderId_businessId: { orderId, businessId } },
  });
  res.json({ data: { link: link ? linkPayload(link) : null } });
}));

/**
 * Creates the link for an order, or rotates the token of an existing one.
 *
 * A unique-token clash is astronomically unlikely, but it must never surface
 * as a 500 to the person sharing the link — so the write is retried once
 * with a fresh token.
 */
async function createOrRotateLink(input: {
  businessId: string;
  actorId: string;
  order: { id: string; orderNumber: string };
  existing: { id: string } | null;
  requestId: string;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = generateTrackingToken();
    try {
      return await prisma.$transaction(async (tx) => {
        const saved = input.existing
          ? await tx.orderTrackingLink.update({
            where: { id: input.existing.id },
            data: {
              token,
              createdById: input.actorId,
              revokedAt: null,
              lastViewedAt: null,
              viewCount: 0,
            },
          })
          : await tx.orderTrackingLink.create({
            data: {
              businessId: input.businessId,
              orderId: input.order.id,
              token,
              createdById: input.actorId,
            },
          });
        await tx.auditEvent.create({
          data: {
            businessId: input.businessId,
            actorId: input.actorId,
            action: input.existing ? 'order.tracking_link.regenerated' : 'order.tracking_link.created',
            entityType: 'order',
            entityId: input.order.id,
            metadata: { linkId: saved.id, orderNumber: input.order.orderNumber },
            requestId: input.requestId,
          },
        });
        return saved;
      });
    } catch (error) {
      const tokenClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!tokenClash || attempt === 1) throw error;
    }
  }
  throw new HttpError(500, 'The tracking link could not be created. Please try again.', 'TRACKING_LINK_FAILED');
}

router.post('/:orderId/tracking-link', authenticate, requireBusinessPermission('orders:share'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const { regenerate } = createLinkSchema.parse(req.body ?? {});
  const order = await loadOrder(businessId, orderId);

  const existing = await prisma.orderTrackingLink.findUnique({
    where: { orderId_businessId: { orderId, businessId } },
  });

  // An active link is reused so the link the customer already has keeps
  // working; a revoked or explicitly regenerated link gets a fresh token.
  if (existing && !existing.revokedAt && !regenerate) {
    res.json({ data: { link: linkPayload(existing) } });
    return;
  }

  const link = await createOrRotateLink({
    businessId,
    actorId,
    order,
    existing,
    requestId: req.requestId,
  });
  res.status(201).json({ data: { link: linkPayload(link) } });
}));

router.delete('/:orderId/tracking-link', authenticate, requireBusinessPermission('orders:share'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const order = await loadOrder(businessId, orderId);
  const existing = await prisma.orderTrackingLink.findUnique({
    where: { orderId_businessId: { orderId, businessId } },
  });
  if (!existing) {
    res.json({ data: { revoked: true } });
    return;
  }
  if (!existing.revokedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.orderTrackingLink.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'order.tracking_link.revoked',
          entityType: 'order',
          entityId: order.id,
          metadata: { linkId: existing.id, orderNumber: order.orderNumber },
          requestId: req.requestId,
        },
      });
    });
  }
  res.json({ data: { revoked: true } });
}));

router.get('/:orderId/customer-messages', authenticate, requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  await loadOrder(businessId, orderId);
  const messages = await prisma.orderCustomerMessage.findMany({
    where: { businessId, orderId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orderId: true,
      kind: true,
      body: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
    },
  });
  res.json({
    data: {
      messages: messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        resolvedAt: message.resolvedAt ? message.resolvedAt.toISOString() : null,
      })),
    },
  });
}));

router.patch('/:orderId/customer-messages/:messageId', authenticate, requireBusinessPermission('orders:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const messageId = idSchema.parse(req.params.messageId);
  const { status } = messageStatusSchema.parse(req.body);
  const order = await loadOrder(businessId, orderId);
  const message = await prisma.orderCustomerMessage.findFirst({
    where: { id: messageId, businessId, orderId },
    select: { id: true, status: true },
  });
  if (!message) throw new HttpError(404, 'Customer message not found', 'CUSTOMER_MESSAGE_NOT_FOUND');
  if (message.status === status) {
    res.json({ data: { updated: false } });
    return;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.orderCustomerMessage.update({
      where: { id: message.id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
      },
      select: {
        id: true,
        orderId: true,
        kind: true,
        body: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId,
        action: status === 'RESOLVED' ? 'order.customer_message.resolved' : 'order.customer_message.reopened',
        entityType: 'order',
        entityId: order.id,
        metadata: { messageId: saved.id, orderNumber: order.orderNumber },
        requestId: req.requestId,
      },
    });
    return saved;
  });
  res.json({
    data: {
      updated: true,
      message: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      },
    },
  });
}));

export default router;
