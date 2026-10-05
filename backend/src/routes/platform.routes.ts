import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requirePlatformPermission } from '../middleware/auth.js';
import { businessPermissions, platformPermissions } from '../permissions.js';

const router = express.Router();
const businessSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  templateKey: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/).default('tailor'),
});
const ownerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  initialPassword: z.string().min(16).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
});
const staffSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(20).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
  permissions: z.array(z.string()).max(platformPermissions.length),
});
const staffPermissionsSchema = z.object({
  permissions: z.array(z.string()).max(platformPermissions.length),
  active: z.boolean().optional(),
});
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) });
const listSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const idSchema = z.string().uuid();

function getActorId(req: express.Request): string {
  if (req.auth?.scope !== 'platform') {
    throw new HttpError(403, 'Platform access is required', 'PLATFORM_ACCESS_DENIED');
  }
  return req.auth.userId;
}

function validatePlatformGrants(keys: string[], actorGrants: readonly string[]): string[] {
  const available = new Set<string>(platformPermissions.map(([key]) => key));
  const unknown = keys.find((key) => !available.has(key));
  if (unknown) throw new HttpError(400, `Unknown platform permission: ${unknown}`, 'UNKNOWN_PLATFORM_PERMISSION');
  const escalation = keys.find((key) => !actorGrants.includes(key));
  if (escalation) throw new HttpError(403, 'You cannot grant a permission you do not hold', 'PLATFORM_PERMISSION_ESCALATION');
  return [...new Set(keys)];
}

async function writePlatformAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  requestId: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.auditEvent.create({
    data: { actorId, action, entityType, entityId, requestId, metadata },
  });
}

router.use(authenticate);

router.get('/businesses', requirePlatformPermission('platform:businesses:read'), asyncHandler(async (req, res) => {
  const query = listSchema.parse(req.query);
  if (query.cursor) {
    const cursor = await prisma.business.findUnique({ where: { id: query.cursor }, select: { id: true } });
    if (!cursor) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const businesses = await prisma.business.findMany({
    where: query.q ? { OR: [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
    ] } : {},
    include: {
      _count: { select: { memberships: true } },
      template: { select: { id: true, key: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = businesses.length > query.limit;
  const page = hasMore ? businesses.slice(0, query.limit) : businesses;
  res.json({ data: { items: page, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
}));

router.post('/businesses', requirePlatformPermission('platform:businesses:manage'), asyncHandler(async (req, res) => {
  const actorId = getActorId(req);
  const input = businessSchema.parse(req.body);
  try {
    const business = await prisma.$transaction(async (tx) => {
      const template = await tx.businessTemplate.findUnique({
        where: { key: input.templateKey },
        select: { id: true, key: true },
      });
      if (!template) throw new HttpError(400, 'Choose an available business template', 'BUSINESS_TEMPLATE_NOT_FOUND');
      const created = await tx.business.create({
        data: {
          name: input.name,
          slug: input.slug,
          businessType: template.key.toUpperCase(),
          templateId: template.id,
          status: 'PENDING',
        },
        include: { template: { select: { id: true, key: true, name: true } } },
      });
      const defaultPlan = await tx.subscriptionPlan.findFirst({
        where: { active: true, isDefault: true },
      });
      if (defaultPlan?.trialDays) {
        const startsAt = new Date();
        const endsAt = new Date(startsAt);
        endsAt.setUTCDate(endsAt.getUTCDate() + defaultPlan.trialDays);
        const graceSetting = await tx.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } });
        const settingValue = graceSetting?.value;
        const graceDays = typeof settingValue === 'object' && settingValue !== null
          && 'gracePeriodDays' in settingValue && typeof settingValue.gracePeriodDays === 'number'
          ? settingValue.gracePeriodDays : 7;
        const subscription = await tx.subscription.create({
          data: {
            businessId: created.id,
            planId: defaultPlan.id,
            status: 'TRIAL',
            cycle: 'MONTHLY',
            startsAt,
            endsAt,
            graceUntil: new Date(endsAt.getTime() + graceDays * 86400000),
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            businessId: created.id,
            subscriptionId: subscription.id,
            actorId,
            action: 'subscription.trial_provisioned',
            metadata: { trialDays: defaultPlan.trialDays, plan: defaultPlan.name },
          },
        });
      }
      await writePlatformAudit(tx, actorId, 'platform.business_created', 'business', created.id, req.requestId, {
        name: created.name,
        slug: created.slug,
        templateKey: template.key,
      });
      return created;
    });
    res.status(201).json({ data: business });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A business with this slug already exists', 'DUPLICATE_BUSINESS');
    }
    throw error;
  }
}));

router.post('/businesses/:businessId/owners', requirePlatformPermission('platform:businesses:manage'), asyncHandler(async (req, res) => {
  const actorId = getActorId(req);
  const businessId = idSchema.parse(req.params.businessId);
  const input = ownerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.initialPassword, 12);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } });
      if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
      const role = await tx.role.upsert({
        where: { businessId_name: { businessId, name: 'Owner' } },
        update: {},
        create: { businessId, name: 'Owner', isSystem: true },
      });
      const permissionKeys = businessPermissions.map(([key]) => key);
      await tx.permission.createMany({
        data: businessPermissions.map(([key, description]) => ({ key, description })),
        skipDuplicates: true,
      });
      const permissions = await tx.permission.findMany({
        where: { key: { in: permissionKeys } },
        select: { id: true },
      });
      await tx.rolePermissionGrant.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      });

      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        include: { memberships: { where: { businessId }, include: { role: true } } },
      });
      if (existingUser?.platformRole) {
        throw new HttpError(409, 'A platform account cannot be assigned as a business owner', 'PLATFORM_USER_BUSINESS_ROLE_CONFLICT');
      }
      if (existingUser?.memberships[0] && existingUser.memberships[0].role.name !== 'Owner') {
        throw new HttpError(409, 'This account already has a different role in the business', 'BUSINESS_ROLE_CONFLICT');
      }
      const user = existingUser ?? await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
        },
      });
      if (!user.active) throw new HttpError(409, 'The account is inactive', 'ACCOUNT_UNAVAILABLE');
      const membership = await tx.membership.upsert({
        where: { businessId_userId: { businessId, userId: user.id } },
        update: { active: true, roleId: role.id },
        create: { businessId, userId: user.id, roleId: role.id },
      });
      await writePlatformAudit(tx, actorId, 'platform.business_owner_assigned', 'membership', membership.id, req.requestId, {
        businessId,
        userId: user.id,
      });
      return {
        business,
        owner: { id: user.id, name: user.name, email: user.email },
        membershipId: membership.id,
        accountCreated: !existingUser,
      };
    }, { maxWait: 10_000, timeout: 30_000 });
    res.status(201).json({ data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'An account with this email already exists', 'DUPLICATE_USER');
    }
    throw error;
  }
}));

router.patch('/businesses/:businessId/status', requirePlatformPermission('platform:businesses:manage'), asyncHandler(async (req, res) => {
  const actorId = getActorId(req);
  const businessId = idSchema.parse(req.params.businessId);
  const { status } = statusSchema.parse(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id: businessId }, select: { id: true, status: true } });
    if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
    if (status === 'ACTIVE') {
      const owner = await tx.membership.findFirst({
        where: { businessId, active: true, role: { name: 'Owner', businessId }, user: { active: true } },
        select: { id: true },
      });
      if (!owner) throw new HttpError(409, 'Assign an active business owner before activation', 'BUSINESS_OWNER_REQUIRED');
    }
    const next = await tx.business.update({ where: { id: businessId }, data: { status } });
    if (business.status === 'PENDING' && status === 'ACTIVE') {
      const trial = await tx.subscription.findFirst({
        where: { businessId, status: 'TRIAL' },
        include: { plan: { select: { trialDays: true } } },
        orderBy: { createdAt: 'desc' },
      });
      if (trial?.plan.trialDays) {
        const startsAt = new Date();
        const endsAt = new Date(startsAt);
        endsAt.setUTCDate(endsAt.getUTCDate() + trial.plan.trialDays);
        const setting = await tx.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } });
        const value = setting?.value;
        const graceDays = typeof value === 'object' && value !== null
          && 'gracePeriodDays' in value && typeof value.gracePeriodDays === 'number'
          ? value.gracePeriodDays : 7;
        await tx.subscription.update({
          where: { id: trial.id },
          data: { startsAt, endsAt, graceUntil: new Date(endsAt.getTime() + graceDays * 86400000) },
        });
        await tx.subscriptionEvent.create({
          data: { businessId, subscriptionId: trial.id, actorId, action: 'subscription.trial_started', metadata: { trialDays: trial.plan.trialDays } },
        });
        await writePlatformAudit(tx, actorId, 'platform.subscription_trial_started', 'subscription', trial.id, req.requestId, { trialDays: trial.plan.trialDays });
      }
    }
    await writePlatformAudit(tx, actorId, 'platform.business_status_changed', 'business', businessId, req.requestId, {
      from: business.status,
      to: status,
    });
    return next;
  });
  res.json({ data: updated });
}));

router.get('/staff', requirePlatformPermission('platform:staff:manage'), asyncHandler(async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { platformRole: 'PLATFORM_STAFF' },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      platformPermissions: { select: { permission: { select: { key: true } } } },
    },
    orderBy: { email: 'asc' },
  });
  res.json({
    data: {
      items: staff.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        active: user.active,
        permissions: user.platformPermissions.map(({ permission }) => permission.key),
      })),
    },
  });
}));

router.post('/staff', requirePlatformPermission('platform:staff:manage'), asyncHandler(async (req, res) => {
  const actorId = getActorId(req);
  const input = staffSchema.parse(req.body);
  const grants = validatePlatformGrants(input.permissions, req.auth?.platformPermissions ?? []);
  try {
    const staff = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await bcrypt.hash(input.password, 12),
          platformRole: 'PLATFORM_STAFF',
        },
      });
      for (const key of grants) {
        const permission = await tx.permission.upsert({
          where: { key },
          update: {},
          create: { key, description: platformPermissions.find(([permissionKey]) => permissionKey === key)?.[1] ?? key },
        });
        await tx.platformPermissionGrant.create({ data: { userId: user.id, permissionId: permission.id } });
      }
      await writePlatformAudit(tx, actorId, 'platform.staff_created', 'user', user.id, req.requestId, { permissions: grants });
      return { id: user.id, name: user.name, email: user.email, active: user.active, permissions: grants };
    });
    res.status(201).json({ data: staff });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'An account with this email already exists', 'DUPLICATE_USER');
    }
    throw error;
  }
}));

router.patch('/staff/:userId/permissions', requirePlatformPermission('platform:staff:manage'), asyncHandler(async (req, res) => {
  const actorId = getActorId(req);
  const userId = idSchema.parse(req.params.userId);
  const input = staffPermissionsSchema.parse(req.body);
  const grants = validatePlatformGrants(input.permissions, req.auth?.platformPermissions ?? []);
  if (userId === actorId && input.active === false) {
    throw new HttpError(409, 'Use another platform administrator to deactivate your account', 'SELF_DEACTIVATION_DENIED');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, platformRole: 'PLATFORM_STAFF' },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!user) throw new HttpError(404, 'Platform staff account not found', 'PLATFORM_STAFF_NOT_FOUND');
    await tx.platformPermissionGrant.deleteMany({ where: { userId } });
    for (const key of grants) {
      const permission = await tx.permission.findUnique({ where: { key } });
      if (!permission) throw new HttpError(400, `Unknown platform permission: ${key}`, 'UNKNOWN_PLATFORM_PERMISSION');
      await tx.platformPermissionGrant.create({ data: { userId, permissionId: permission.id } });
    }
    const next = input.active === undefined ? user : await tx.user.update({
      where: { id: userId },
      data: { active: input.active },
      select: { id: true, name: true, email: true, active: true },
    });
    await writePlatformAudit(tx, actorId, 'platform.staff_permissions_changed', 'user', userId, req.requestId, { permissions: grants });
    return { ...next, permissions: grants };
  });
  res.json({ data: updated });
}));

router.get('/permissions', requirePlatformPermission('platform:staff:manage'), (_req, res) => {
  res.json({ data: { items: platformPermissions.map(([key, description]) => ({ key, description })) } });
});

router.get('/health', requirePlatformPermission('platform:system:health'), asyncHandler(async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: 'healthy', database: 'connected', checkedAt: new Date().toISOString() } });
  } catch (error) {
    req.log.error({ cause: error instanceof Error ? error.name : 'unknown' }, 'Platform database health check failed');
    next(new HttpError(503, 'Database readiness check failed', 'SYSTEM_UNREADY'));
  }
}));

export default router;
