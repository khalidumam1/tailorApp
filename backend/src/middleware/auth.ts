import type { RequestHandler } from 'express';
import type { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { cachedPolicy } from '../policy-cache.js';
import { assertBusinessModuleEnabled, moduleForBusinessPermission } from '../business-modules.js';
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

  // The membership id and user id are known from the signed token before any
  // query runs, so every lookup filters on them directly and all of them run
  // concurrently: one database round trip instead of a nested include tree
  // that Prisma loads relation by relation.
  const isBusinessScope = claims.data.scope === 'business';
  const [user, business, rolePermissionKeys, platformPermissionKeys] = await Promise.all([
    prisma.user.findUnique({
      where: { id: claims.data.sub },
      select: { id: true, active: true, platformRole: true },
    }),
    isBusinessScope
      ? prisma.business.findFirst({
        where: { memberships: { some: { id: claims.data.membershipId, userId: claims.data.sub, active: true } } },
        select: { id: true, name: true, slug: true, timezone: true, status: true },
      })
      : Promise.resolve(null),
    isBusinessScope
      ? prisma.permission.findMany({
        where: {
          roleGrants: {
            some: {
              role: {
                memberships: { some: { id: claims.data.membershipId, userId: claims.data.sub, active: true } },
              },
            },
          },
        },
        select: { key: true },
      })
      : Promise.resolve([]),
    isBusinessScope
      ? Promise.resolve([])
      : prisma.permission.findMany({
        where: { platformGrants: { some: { userId: claims.data.sub } } },
        select: { key: true },
      }),
  ]);
  if (!user?.active) {
    throw new HttpError(401, 'Account is unavailable', 'ACCOUNT_UNAVAILABLE');
  }

  if (isBusinessScope) {
    if (!business || business.status !== 'ACTIVE') {
      throw new HttpError(403, 'Business membership is inactive', 'MEMBERSHIP_INACTIVE');
    }
    req.auth = {
      userId: user.id,
      scope: 'business',
      membershipId: claims.data.membershipId,
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        timezone: business.timezone,
      },
      permissions: rolePermissionKeys.map((permission) => permission.key),
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
      platformPermissions: platformPermissionKeys.map((permission) => permission.key),
      platformRole: user.platformRole,
    };
  }
  next();
});

export function requireBusinessPermission(
  permission: string,
  planFeature?: string,
  explicitModule?: string,
): RequestHandler {
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
    const module = moduleForBusinessPermission(permission, explicitModule);
    // Module and subscription policy checks are independent: run them together
    // and let the route handler reuse the same module resolution via `req`.
    await Promise.all([
      module ? assertBusinessModuleEnabled(req.auth.business.id, module, req) : Promise.resolve(),
      assertSubscriptionAccess(req.auth.business.id, permission, paidMutation, planFeature),
    ]);
    next();
  });
  return handler;
}

export async function assertSubscriptionAccess(
  businessId: string,
  permission?: string,
  isPaidMutation = true,
  explicitFeature?: string,
): Promise<void> {
  // Policy lookups are cached briefly (see policy-cache.ts) and invalidated by
  // subscription/billing writes, so steady-state requests skip the round trips.
  const policy = await cachedPolicy(`billing-entitlement:${businessId}`, async () => {
    const setting = await prisma.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } });
    const billing = setting?.value;
    const enforcementEnabled = typeof billing === 'object' && billing !== null
      && 'enforcementEnabled' in billing && billing.enforcementEnabled === true;
    if (!enforcementEnabled) {
      return { enforcementEnabled: false as const, entitlementId: null, planId: null, features: null };
    }
    const now = new Date();
    const entitlementFilter: Prisma.SubscriptionWhereInput = {
      businessId,
      status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED'] },
      startsAt: { lte: now },
      graceUntil: { gt: now },
    };
    // The entitlement row and the plans referenced by matching entitlements are
    // fetched concurrently; the ordered entitlement still decides which plan
    // applies, so enforcement semantics are unchanged.
    const [entitlement, candidatePlans] = await Promise.all([
      prisma.subscription.findFirst({
        where: entitlementFilter,
        orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, planId: true },
      }),
      prisma.subscriptionPlan.findMany({
        where: { subscriptions: { some: entitlementFilter } },
        select: { id: true, features: true },
      }),
    ]);
    return {
      enforcementEnabled: true as const,
      entitlementId: entitlement?.id ?? null,
      planId: entitlement?.planId ?? null,
      features: entitlement ? candidatePlans.find((plan) => plan.id === entitlement.planId)?.features ?? null : null,
    };
  });
  if (!policy.enforcementEnabled) return;
  if (!policy.entitlementId && isPaidMutation) {
    throw new HttpError(402, 'Your subscription has expired. Submit a renewal payment to restore paid features.', 'SUBSCRIPTION_REQUIRED');
  }
  if (!policy.entitlementId) return;

  const feature = explicitFeature ?? (permission?.startsWith('customers:') ? 'customers'
    : permission?.startsWith('measurements:') ? 'measurements'
      : permission?.startsWith('orders:') ? 'orders'
        : permission?.startsWith('payments:') ? 'payments'
          : permission?.startsWith('notifications:') ? 'notifications'
            : permission === 'staff:manage' ? 'staff'
              : permission === 'reports:read' ? 'reports'
                : permission?.startsWith('inventory:') ? 'inventory'
                  : permission?.startsWith('suppliers:') ? 'suppliers'
                    : permission?.startsWith('purchasing:') ? 'purchasing'
                      : permission?.startsWith('cashbook:') ? 'cashbook'
                        : permission?.startsWith('accounting:') ? 'accounting' : undefined);
  const features = policy.features;
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
