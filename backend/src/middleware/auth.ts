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
    };
  }
  next();
});

export function requireBusinessPermission(permission: string): RequestHandler {
  return (req, _res, next) => {
    if (req.auth?.scope !== 'business' || !req.auth.business) {
      next(new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED'));
      return;
    }
    if (!req.auth.permissions.includes(permission)) {
      next(new HttpError(403, 'Permission is not granted', 'PERMISSION_DENIED'));
      return;
    }
    next();
  };
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
