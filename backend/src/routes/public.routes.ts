/**
 * Unauthenticated routes the marketing site needs.
 *
 * Two endpoints, both deliberately narrow:
 *
 *   GET  /api/v1/public/plans   the published price list
 *   POST /api/v1/public/signup  create a business, its owner and a trial
 *
 * Everything here is public by definition, so the shape of the responses is
 * part of the contract: /plans exposes only what a buyer needs to choose, and
 * /signup is switched off until the platform turns it on.
 */

import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { businessPermissions } from '../permissions.js';
import {
  SELF_SIGNUP_SETTING_KEY,
  findAvailableSlug,
  isSelfSignupEnabled,
  slugify,
  toPublicPlan,
} from '../self-signup.js';
import { createSession } from './auth.routes.js';

const router = express.Router();

/** Mirrors the platform console's fallback when no grace period is configured. */
const gracePeriodDaysDefault = 7;

/* -------------------------------------------------------------------- input */

const signupSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  templateKey: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/),
  ownerName: z.string().trim().min(1).max(160),
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  // 12 characters is the floor for a password the owner chose themselves,
  // hashed at bcrypt cost 12. It is deliberately below the 16-20 characters
  // the platform console requires, because those are credentials an admin
  // hands to somebody else and this one is typed at a signup form, where a
  // stricter rule only produces abandoned trials.
  password: z.string().min(12).max(72)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, "Password must not exceed bcrypt's 72-byte limit"),
  timezone: z.string().trim().min(1).max(64).optional(),
  currency: z.string().trim().length(3).optional(),
});

/* ------------------------------------------------------------------- routes */

router.get('/plans', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { monthlyPrice: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      monthlyPrice: true,
      yearlyPrice: true,
      currency: true,
      trialDays: true,
      features: true,
      limits: true,
    },
  });
  res.json({ data: { items: plans.map(toPublicPlan) } });
}));

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  // Generous in tests: the suite creates several businesses in a row.
  limit: env.NODE_ENV === 'test' ? 500 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-up attempts from this network; please try again later',
    },
    requestId: req.requestId,
  }),
});

router.post('/signup', signupLimiter, asyncHandler(async (req, res) => {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: SELF_SIGNUP_SETTING_KEY },
    select: { value: true },
  });
  if (!isSelfSignupEnabled(setting?.value)) {
    throw new HttpError(403, 'Self-signup is not enabled on this platform', 'SELF_SIGNUP_DISABLED');
  }

  const input = signupSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const template = await tx.businessTemplate.findUnique({
        where: { key: input.templateKey },
        select: { id: true, key: true, active: true },
      });
      if (!template?.active) {
        throw new HttpError(400, 'Choose an available business template', 'BUSINESS_TEMPLATE_NOT_FOUND');
      }

      // This tells an anonymous caller whether an email is registered, which
      // is the one place the product trades a little enumeration resistance
      // for a usable signup form. It becomes unnecessary once transactional
      // email lands: the duplicate case can answer 202 "check your inbox"
      // exactly like the success case, and no longer needs saying here.
      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true, platformRole: true },
      });
      if (existingUser) {
        throw new HttpError(
          409,
          existingUser.platformRole
            ? 'This email belongs to a platform account and cannot be used for a business'
            : 'An account with this email already exists',
          existingUser.platformRole ? 'EMAIL_RESERVED' : 'DUPLICATE_USER',
        );
      }

      const base = input.slug ?? (slugify(input.businessName) || 'business');
      const slug = await findAvailableSlug(base, async (candidate) => {
        const taken = await tx.business.findUnique({ where: { slug: candidate }, select: { id: true } });
        return taken !== null;
      });

      const user = await tx.user.create({
        data: { email: input.email, name: input.ownerName, passwordHash },
        select: { id: true, name: true, email: true },
      });

      const business = await tx.business.create({
        data: {
          name: input.businessName,
          slug,
          businessType: template.key.toUpperCase(),
          templateId: template.id,
          // The platform console creates businesses PENDING and activates them
          // by hand. Self-signup has to skip that step — sign-in only offers
          // memberships in ACTIVE businesses, so a PENDING business would
          // leave the new owner unable to reach the workspace they just made.
          status: 'ACTIVE',
          ...(input.timezone ? { timezone: input.timezone } : {}),
          ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
        },
        select: { id: true, name: true, slug: true },
      });

      const role = await tx.role.create({
        data: { businessId: business.id, name: 'Owner', isSystem: true },
        select: { id: true },
      });
      await tx.permission.createMany({
        data: businessPermissions.map(([key, description]) => ({ key, description })),
        skipDuplicates: true,
      });
      const permissions = await tx.permission.findMany({
        where: { key: { in: businessPermissions.map(([key]) => key) } },
        select: { id: true },
      });
      await tx.rolePermissionGrant.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      });

      const membership = await tx.membership.create({
        data: { businessId: business.id, userId: user.id, roleId: role.id },
        select: { id: true },
      });

      let trial: { plan: string; trialDays: number; endsAt: Date } | null = null;
      const defaultPlan = await tx.subscriptionPlan.findFirst({ where: { active: true, isDefault: true } });
      if (defaultPlan) {
        const startsAt = new Date();
        const endsAt = new Date(startsAt);
        endsAt.setUTCDate(endsAt.getUTCDate() + defaultPlan.trialDays);
        const graceSetting = await tx.platformSetting.findUnique({
          where: { key: 'billing' },
          select: { value: true },
        });
        const graceValue = graceSetting?.value;
        const graceDays = typeof graceValue === 'object' && graceValue !== null
          && 'gracePeriodDays' in graceValue && typeof graceValue.gracePeriodDays === 'number'
          ? graceValue.gracePeriodDays
          : gracePeriodDaysDefault;
        const subscription = await tx.subscription.create({
          data: {
            businessId: business.id,
            planId: defaultPlan.id,
            status: defaultPlan.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
            cycle: 'MONTHLY',
            startsAt,
            endsAt,
            graceUntil: new Date(endsAt.getTime() + graceDays * 86_400_000),
          },
          select: { id: true },
        });
        await tx.subscriptionEvent.create({
          data: {
            businessId: business.id,
            subscriptionId: subscription.id,
            actorId: user.id,
            action: defaultPlan.trialDays > 0 ? 'subscription.trial_provisioned' : 'subscription.started',
            metadata: {
              plan: defaultPlan.name,
              trialDays: defaultPlan.trialDays,
              source: 'self_signup',
            },
          },
        });
        trial = { plan: defaultPlan.name, trialDays: defaultPlan.trialDays, endsAt };
      }

      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          businessId: business.id,
          action: 'public.business_self_signup',
          entityType: 'business',
          entityId: business.id,
          requestId: req.requestId,
          metadata: { name: business.name, slug: business.slug, templateKey: template.key },
        },
      });

      return { business, user, membership, trial };
    }, { maxWait: 10_000, timeout: 30_000 });

    const session = await createSession(created.user.id, 'business', created.membership.id);

    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      data: {
        business: created.business,
        owner: created.user,
        // Signed straight in: the alternative is to create the account and
        // hope they come back, which is where trial signups go to die.
        session: { ...session, expiresIn: 900 },
        trial: created.trial
          ? { ...created.trial, endsAt: created.trial.endsAt.toISOString() }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Two businesses can race for the same slug, and the email check above
      // is not a lock. Both mean: try again with different details.
      throw new HttpError(409, 'That business name or email is already taken', 'DUPLICATE_SIGNUP');
    }
    throw error;
  }
}));

/** Public list of the templates a new business can pick from. */
router.get('/templates', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
  const templates = await prisma.businessTemplate.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, key: true, name: true, category: true, description: true },
  });
  res.json({ data: { items: templates } });
}));

export default router;
