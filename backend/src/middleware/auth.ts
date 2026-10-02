import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from './async-handler.js';

const accessClaimsSchema = z.discriminatedUnion('scope', [
  z.object({ sub: z.string().uuid(), scope: z.literal('business'), membershipId: z.string().uuid() }),
  z.object({ sub: z.string().uuid(), scope: z.literal('platform'), membershipId: z.never().optional() }),
]);

export interface AuthContext {
  userId: string;
  scope: 'business' | 'platform';
  membershipId?: string;
  business?: { id: string; name: string; slug: string; timezone: string };
  permissions: string[];
  platformPermissions: string[];
  platformRole?: 'SUPER_ADMIN' | 'PLATFORM_STAFF';
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
  }

  let claims;
  try {
    const decoded = jwt.verify(authorization.slice(7), env.ACCESS_TOKEN_SECRET, {
      issuer: 'tailor-api',
      audience: 'tailor-clients',
      algorithms: ['HS256'],
    });
    claims = accessClaimsSchema.safeParse(decoded);
  } catch {
    throw new HttpError(401, 'Access token is invalid or expired', 'INVALID_TOKEN');
  }
  if (!claims.success) {
    throw new HttpError(401, 'Access token is invalid or expired', 'INVALID_TOKEN');
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.data.sub },
    select: {
      id: true,
      active: true,
      platformRole: true,
      memberships: {
        where: { id: claims.data.membershipId, active: true },
        include: {
          business: true,
          role: { include: { grants: { include: { permission: true } } } },
        },
      },
      platformPermissions: { include: { permission: true } },
    },
  });
  if (!user?.active) {
    throw new HttpError(401, 'Account is unavailable', 'ACCOUNT_UNAVAILABLE');
  }

  if (claims.data.scope === 'business') {
    const membership = user.memberships[0];
    if (!membership || membership.business.status !== 'ACTIVE') {
      throw new HttpError(403, 'Business membership is inactive', 'MEMBERSHIP_INACTIVE');
    }
    req.auth = {
      userId: user.id,
      scope: 'business',
      membershipId: membership.id,
      business: {
        id: membership.business.id,
        name: membership.business.name,
        slug: membership.business.slug,
        timezone: membership.business.timezone,
      },
      permissions: membership.role.grants.map((grant) => grant.permission.key),
      platformPermissions: [],
    };
  } else {
    if (!user.platformRole) {
      throw new HttpError(403, 'Platform access is not granted', 'PLATFORM_ACCESS_DENIED');
    }
    req.auth = {
      userId: user.id,
      scope: 'platform',
      permissions: [],
      platformPermissions: user.platformPermissions.map((grant) => grant.permission.key),
      platformRole: user.platformRole,
    };
  }
  next();
});

export function requireBusinessPermission(permission: string): RequestHandler {
  const handler: RequestHandler = asyncHandler(async (req, _res, next) => {
    if (req.auth?.scope !== 'business' || !req.auth.business) {
      next(new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED'));
      return;
    }
    if (!req.auth.permissions.includes(permission)) {
      next(new HttpError(403, 'Permission is not granted', 'PERMISSION_DENIED'));
      return;
    }
    const paidMutation = !permission.startsWith('subscriptions:')
      && (permission.endsWith(':write') || permission.endsWith(':manage') || permission === 'orders:transition');
    await assertSubscriptionAccess(req.auth.business.id, permission, paidMutation);
    next();
  });
  return handler;
}

export async function assertSubscriptionAccess(
  businessId: string,
  permission?: string,
  isPaidMutation = true,
): Promise<void> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } });
  const billing = setting?.value;
  const enforcementEnabled = typeof billing === 'object' && billing !== null
    && 'enforcementEnabled' in billing && billing.enforcementEnabled === true;
  if (!enforcementEnabled) return;
  const now = new Date();
  const entitlement = await prisma.subscription.findFirst({
    where: {
      businessId,
      status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED'] },
      startsAt: { lte: now },
      graceUntil: { gt: now },
    },
    orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
    include: { plan: { select: { features: true } } },
  });
  if (!entitlement && isPaidMutation) {
    throw new HttpError(402, 'Your subscription has expired. Submit a renewal payment to restore paid features.', 'SUBSCRIPTION_REQUIRED');
  }
  if (!entitlement) return;

  const feature = permission?.startsWith('customers:') ? 'customers'
    : permission?.startsWith('measurements:') ? 'measurements'
      : permission?.startsWith('orders:') ? 'orders'
        : permission?.startsWith('payments:') ? 'payments'
            : permission === 'staff:manage' ? 'staff'
            : permission === 'reports:read' ? 'reports' : undefined;
  const features = entitlement.plan.features;
  if (feature && typeof features === 'object' && features !== null && !Array.isArray(features)
    && feature in features && features[feature] === false) {
    throw new HttpError(403, `Your current plan does not include ${feature}.`, 'SUBSCRIPTION_FEATURE_UNAVAILABLE');
  }
}

export function requirePlatformPermission(permission: string): RequestHandler {
  return (req, _res, next) => {
    if (req.auth?.scope !== 'platform' || !req.auth.platformPermissions.includes(permission)) {
      next(new HttpError(403, 'Platform permission is not granted', 'PLATFORM_PERMISSION_DENIED'));
      return;
    }
    next();
  };
}

export function requireSuperAdminPermission(permission: string): RequestHandler {
  return (req, _res, next) => {
    if (req.auth?.scope !== 'platform' || req.auth.platformRole !== 'SUPER_ADMIN'
      || !req.auth.platformPermissions.includes(permission)) {
      next(new HttpError(403, 'This action requires a super admin with the explicit permission', 'SUPER_ADMIN_PERMISSION_REQUIRED'));
      return;
    }
    next();
  };
}
