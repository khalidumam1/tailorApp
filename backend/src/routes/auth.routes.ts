import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(128).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, "Password must not exceed bcrypt's 72-byte limit"),
  scope: z.enum(['business', 'platform']).optional(),
  businessId: z.string().uuid().optional(),
});
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(200) });
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
  newPassword: z.string().min(16).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
});

const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

function createAccessToken(userId: string, scope: 'business' | 'platform', membershipId?: string): string {
  return jwt.sign(
    { scope, ...(membershipId ? { membershipId } : {}) },
    env.ACCESS_TOKEN_SECRET,
    { subject: userId, issuer: 'tailor-api', audience: 'tailor-clients', expiresIn: '15m', algorithm: 'HS256' },
  );
}

function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

async function createSession(
  userId: string,
  scope: 'business' | 'platform',
  membershipId?: string,
) {
  const refreshToken = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      membershipId,
      tokenHash: tokenHash(refreshToken),
      expiresAt: new Date(Date.now() + refreshLifetimeMs),
    },
  });
  return { accessToken: createAccessToken(userId, scope, membershipId), refreshToken };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts; please try again later' },
    requestId: req.requestId,
  }),
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many session refresh attempts; please try again later' },
    requestId: req.requestId,
  }),
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      memberships: {
        where: { active: true, business: { status: 'ACTIVE' } },
        include: { business: true },
        // Without an explicit order PostgreSQL returns memberships in an arbitrary
        // (physical row) order, so the business picker reshuffled on every sign-in.
        // Owners pick their shop by position/recognition, so keep it stable.
        orderBy: { business: { name: 'asc' } },
      },
    },
  });
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? dummyPasswordHash);
  if (!user || !user.active || !passwordMatches) {
    throw new HttpError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
  }

  if (user.platformRole && !input.scope) {
    res.status(200).json({
      data: {
        requiresScopeSelection: true,
        canAccessPlatform: true,
        businesses: user.memberships.map(({ business }) => ({ id: business.id, name: business.name })),
      },
    });
    return;
  }

  const scope = input.scope ?? 'business';
  if (scope === 'platform') {
    if (!user.platformRole) throw new HttpError(403, 'Platform access is not granted', 'PLATFORM_ACCESS_DENIED');
    const session = await createSession(user.id, 'platform');
    res.json({ data: { user: { id: user.id, name: user.name, email: user.email, platformRole: user.platformRole }, ...session } });
    return;
  }

  const memberships = user.memberships.filter(({ business }) =>
    !input.businessId || business.id === input.businessId,
  );
  if (memberships.length > 1) {
    res.status(200).json({
      data: {
        requiresBusinessSelection: true,
        businesses: memberships.map(({ business }) => ({ id: business.id, name: business.name })),
      },
    });
    return;
  }
  const membership = memberships[0];
  if (!membership) {
    throw new HttpError(403, 'No active membership exists for this business', 'MEMBERSHIP_REQUIRED');
  }
  const session = await createSession(user.id, 'business', membership.id);
  res.json({
    data: {
      user: { id: user.id, name: user.name, email: user.email },
      business: { id: membership.business.id, name: membership.business.name },
      ...session,
    },
  });
}));

router.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: tokenHash(refreshToken) },
    include: {
      user: true,
      membership: { include: { business: true } },
    },
  });
  if (!stored) throw new HttpError(401, 'Refresh token is invalid', 'INVALID_REFRESH_TOKEN');

  const now = new Date();
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new HttpError(401, 'Refresh token reuse detected; sessions were revoked', 'REFRESH_TOKEN_REUSE');
  }
  if (stored.expiresAt <= now || !stored.user.active) {
    await prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new HttpError(401, 'Refresh token is expired or account is unavailable', 'INVALID_REFRESH_TOKEN');
  }

  const scope = stored.membership ? 'business' : 'platform';
  if (stored.membership && (!stored.membership.active || stored.membership.business.status !== 'ACTIVE')) {
    throw new HttpError(403, 'Business membership is inactive', 'MEMBERSHIP_INACTIVE');
  }
  if (!stored.membership && !stored.user.platformRole) {
    throw new HttpError(403, 'Platform access is not granted', 'PLATFORM_ACCESS_DENIED');
  }

  const replacement = createRefreshToken();
  const rotated = await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) return false;
    await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        membershipId: stored.membershipId,
        tokenHash: tokenHash(replacement),
        expiresAt: new Date(Date.now() + refreshLifetimeMs),
      },
    });
    return true;
  });
  if (!rotated) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new HttpError(401, 'Refresh token reuse detected; sessions were revoked', 'REFRESH_TOKEN_REUSE');
  }

  res.json({
    data: {
      accessToken: createAccessToken(stored.userId, scope, stored.membershipId ?? undefined),
      refreshToken: replacement,
    },
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: tokenHash(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.json({ data: { revoked: true } });
}));

router.post('/password/change', authenticate, asyncHandler(async (req, res) => {
  const userId = req.auth?.userId;
  if (!userId) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
  const input = passwordChangeSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !await bcrypt.compare(input.currentPassword, user.passwordHash)) {
    throw new HttpError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
    throw new HttpError(400, 'Choose a password different from the current one', 'PASSWORD_UNCHANGED');
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash, active: true },
      data: { passwordHash },
    });
    if (!updated.count) throw new HttpError(409, 'Account changed during password update; sign in again', 'CREDENTIALS_CHANGED');
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        businessId: req.auth?.business?.id,
        actorId: userId,
        action: 'user.password_changed',
        entityType: 'user',
        entityId: userId,
        metadata: {},
        requestId: req.requestId,
      },
    });
  });
  res.json({ data: { passwordChanged: true, signInAgain: true } });
}));

router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const auth = req.auth;
  if (!auth) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true, platformRole: true },
  });
  if (!user) throw new HttpError(401, 'Account is unavailable', 'ACCOUNT_UNAVAILABLE');
  res.json({ data: { user, context: auth } });
}));

export default router;
