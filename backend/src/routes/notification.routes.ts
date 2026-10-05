import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

const router = express.Router();
const querySchema = z.object({
  customerId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NOT_SENT']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.use(authenticate);

router.get('/', requireBusinessPermission('notifications:read'), asyncHandler(async (req, res) => {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  const query = querySchema.parse(req.query);
  if (query.cursor) {
    const exists = await prisma.whatsAppNotification.findFirst({
      where: { id: query.cursor, businessId: req.auth.business.id },
      select: { id: true },
    });
    if (!exists) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const notifications = await prisma.whatsAppNotification.findMany({
    where: {
      businessId: req.auth.business.id,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.paymentId ? { paymentId: query.paymentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    select: {
      id: true,
      customerId: true,
      orderId: true,
      paymentId: true,
      kind: true,
      status: true,
      recipientPhone: true,
      templateName: true,
      attemptCount: true,
      lastError: true,
      payload: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      failedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = notifications.length > query.limit;
  const items = (hasMore ? notifications.slice(0, query.limit) : notifications)
    .map((notification) => ({
      id: notification.id,
      customerId: notification.customerId,
      orderId: notification.orderId,
      paymentId: notification.paymentId,
      kind: notification.kind,
      status: notification.status === 'PROCESSING' ? 'QUEUED' : notification.status,
      recipientPhone: notification.recipientPhone,
      templateName: notification.templateName,
      attemptCount: notification.attemptCount,
      lastError: notification.lastError,
      renderedMessage: notification.payload && typeof notification.payload === 'object'
        && !Array.isArray(notification.payload)
        && 'renderedBody' in notification.payload
        && typeof notification.payload.renderedBody === 'string'
        ? notification.payload.renderedBody
        : null,
      sentAt: notification.sentAt,
      deliveredAt: notification.deliveredAt,
      readAt: notification.readAt,
      failedAt: notification.failedAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    }));
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

export default router;
