import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const querySchema = z.object({
  businessId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const query = querySchema.parse(req.query);
  const auth = req.auth;
  if (!auth) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');

  let businessId: string | undefined;
  if (auth.scope === 'business') {
    if (!auth.permissions.includes('audit:read')) {
      throw new HttpError(403, 'Permission is not granted', 'PERMISSION_DENIED');
    }
    if (!auth.business) throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
    businessId = auth.business.id;
    if (query.businessId && query.businessId !== businessId) {
      throw new HttpError(403, 'Audit access is limited to your business', 'TENANT_ACCESS_DENIED');
    }
  } else {
    if (!auth.platformPermissions.includes('platform:audit:read')) {
      throw new HttpError(403, 'Platform permission is not granted', 'PLATFORM_PERMISSION_DENIED');
    }
    businessId = query.businessId;
  }

  const where = {
    ...(businessId ? { businessId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to ? {
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    } : {}),
  };
  if (query.cursor) {
    const cursor = await prisma.auditEvent.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } });
    if (!cursor) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const items = await prisma.auditEvent.findMany({
    where,
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = items.length > query.limit;
  const page = hasMore ? items.slice(0, query.limit) : items;
  res.json({ data: { items: page, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
}));

export default router;
