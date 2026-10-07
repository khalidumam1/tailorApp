import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { businessRoleKey } from '../domain/orders.js';
import { assertPlanLimit } from '../plan-limits.js';
import { businessPermissions } from '../permissions.js';

const router = express.Router();
const idSchema = z.string().uuid();
const permissionSchema = z.array(z.string()).max(businessPermissions.length);
const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: permissionSchema,
}).strict();
const memberInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().max(254).transform((email) => email.trim().toLowerCase()),
  initialPassword: z.string().min(16).max(72).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
  roleId: idSchema,
}).strict();
const memberUpdateSchema = z.object({
  roleId: idSchema.optional(),
  active: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'Provide a role or active-state change');
const memberRemovalSchema = z.object({
  reason: z.string().trim().min(5).max(1000).optional(),
}).strict();

function businessId(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function validateGrants(
  keys: string[],
  actorPermissions: readonly string[],
  existingPermissions: readonly string[] = [],
): string[] {
  const available = new Set<string>(businessPermissions.map(([key]) => key));
  const unknown = keys.find((key) => !available.has(key));
  if (unknown) throw new HttpError(400, `Unknown business permission: ${unknown}`, 'UNKNOWN_BUSINESS_PERMISSION');
  if (keys.some((key) => !actorPermissions.includes(key) && !existingPermissions.includes(key))) {
    throw new HttpError(403, 'You cannot grant a permission you do not hold', 'BUSINESS_PERMISSION_ESCALATION');
  }
  return [...new Set(keys)];
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  req: express.Request,
  businessIdValue: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Prisma.InputJsonObject,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      businessId: businessIdValue,
      actorId: req.auth!.userId,
      action,
      entityType,
      entityId,
      metadata,
      requestId: req.requestId,
    },
  });
}

async function replaceRoleGrants(
  tx: Prisma.TransactionClient,
  roleId: string,
  keys: string[],
): Promise<void> {
  const permissionRows = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  if (permissionRows.length !== keys.length) {
    const known = new Set(permissionRows.map((permission) => permission.key));
    const missing = keys.find((key) => !known.has(key));
    if (missing) throw new HttpError(500, `Business permission "${missing}" is not initialized`, 'BUSINESS_PERMISSION_UNAVAILABLE');
  }
  await tx.rolePermissionGrant.deleteMany({ where: { roleId } });
  if (permissionRows.length) {
    await tx.rolePermissionGrant.createMany({
      data: permissionRows.map(({ id }) => ({ roleId, permissionId: id })),
    });
  }
}

async function assertRoleKeyAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  name: string,
  exceptRoleId?: string,
): Promise<string> {
  const key = businessRoleKey(name);
  if (!key) throw new HttpError(400, 'Role name must produce a workflow key', 'INVALID_BUSINESS_ROLE_NAME');
  if (key === 'owner') {
    throw new HttpError(409, 'The Owner role is reserved for platform onboarding', 'BUSINESS_OWNER_REQUIRED');
  }
  const roles = await tx.role.findMany({
    where: { businessId: tenantId, ...(exceptRoleId ? { id: { not: exceptRoleId } } : {}) },
    select: { id: true, name: true },
  });
  if (roles.some((role) => businessRoleKey(role.name) === key)) {
    throw new HttpError(409, 'Another business role already uses this workflow key', 'DUPLICATE_BUSINESS_ROLE_KEY');
  }
  return key;
}

router.use(authenticate);

router.get('/permissions', requireBusinessPermission('staff:manage'), (_req, res) => {
  res.json({ data: { items: businessPermissions.map(([key, description]) => ({ key, description })) } });
});

router.get('/roles', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const roles = await prisma.role.findMany({
    where: { businessId: businessId(req) },
    include: {
      grants: { include: { permission: { select: { key: true } } } },
      _count: { select: { memberships: true } },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
  res.json({
    data: {
      items: roles.map((role) => ({
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        permissions: role.grants.map((grant) => grant.permission.key).sort(),
        memberCount: role._count.memberships,
      })),
    },
  });
}));

router.post('/roles', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const tenantId = businessId(req);
  const input = roleInputSchema.parse(req.body);
  const grants = validateGrants(input.permissions, req.auth!.permissions);
  try {
    const role = await prisma.$transaction(async (tx) => {
      await assertRoleKeyAvailable(tx, tenantId, input.name);
      const created = await tx.role.create({ data: { businessId: tenantId, name: input.name } });
      await replaceRoleGrants(tx, created.id, grants);
      await writeAudit(tx, req, tenantId, 'business.role_created', 'role', created.id, {
        name: created.name,
        permissions: grants,
      });
      return { id: created.id, name: created.name, isSystem: created.isSystem, permissions: grants, memberCount: 0 };
    });
    res.status(201).json({ data: role });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A role with this name already exists in this business', 'DUPLICATE_BUSINESS_ROLE');
    }
    throw error;
  }
}));

router.patch('/roles/:roleId', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const tenantId = businessId(req);
  const roleId = idSchema.parse(req.params.roleId);
  const input = roleInputSchema.parse(req.body);
  try {
    const role = await prisma.$transaction(async (tx) => {
      const current = await tx.role.findFirst({
        where: { id: roleId, businessId: tenantId },
        include: { grants: { include: { permission: { select: { key: true } } } } },
      });
      if (!current) throw new HttpError(404, 'Business role not found', 'BUSINESS_ROLE_NOT_FOUND');
      if (current.isSystem) throw new HttpError(403, 'System roles cannot be changed', 'SYSTEM_ROLE_IMMUTABLE');
      const nextRoleKey = await assertRoleKeyAvailable(tx, tenantId, input.name, current.id);
      const previousGrants = current.grants.map((grant) => grant.permission.key);
      const grants = validateGrants(input.permissions, req.auth!.permissions, previousGrants);
      const previousRoleKey = businessRoleKey(current.name);
      if (previousRoleKey !== nextRoleKey) {
        const business = await tx.business.findUnique({
          where: { id: tenantId },
          select: {
            template: { select: { workflowTransitions: { select: { allowedRoleKeys: true } } } },
            workflowStages: { where: { active: true }, select: { id: true }, take: 1 },
            workflowTransitions: { select: { id: true, allowedRoleKeys: true } },
          },
        });
        if (business?.workflowStages.length) {
          for (const transition of business.workflowTransitions) {
            if (!transition.allowedRoleKeys.includes(previousRoleKey)) continue;
            await tx.workflowTransition.update({
              where: { id: transition.id },
              data: { allowedRoleKeys: [...new Set(transition.allowedRoleKeys.map((key) =>
                key === previousRoleKey ? nextRoleKey : key))] },
            });
          }
        } else if (business?.template?.workflowTransitions.some((transition) =>
          transition.allowedRoleKeys.includes(previousRoleKey))) {
          throw new HttpError(409, 'Update the tenant workflow before renaming a role used by the template', 'BUSINESS_ROLE_KEY_IN_USE');
        }
      }
      const updated = await tx.role.update({ where: { id: current.id }, data: { name: input.name } });
      await replaceRoleGrants(tx, updated.id, grants);
      await writeAudit(tx, req, tenantId, 'business.role_updated', 'role', updated.id, {
        name: updated.name,
        permissions: grants,
      });
      return { id: updated.id, name: updated.name, isSystem: updated.isSystem, permissions: grants };
    });
    res.json({ data: role });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A role with this name already exists in this business', 'DUPLICATE_BUSINESS_ROLE');
    }
    throw error;
  }
}));

router.delete('/roles/:roleId', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const tenantId = businessId(req);
  const roleId = idSchema.parse(req.params.roleId);
  await prisma.$transaction(async (tx) => {
    const role = await tx.role.findFirst({
      where: { id: roleId, businessId: tenantId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw new HttpError(404, 'Business role not found', 'BUSINESS_ROLE_NOT_FOUND');
    if (role.isSystem) throw new HttpError(403, 'System roles cannot be removed', 'SYSTEM_ROLE_IMMUTABLE');
    if (role._count.memberships) throw new HttpError(409, 'Reassign this role’s members before removing it', 'BUSINESS_ROLE_IN_USE');
    await tx.role.delete({ where: { id: role.id } });
    await writeAudit(tx, req, tenantId, 'business.role_deleted', 'role', role.id, { name: role.name });
  });
  res.status(204).end();
}));

router.get('/staff', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { businessId: businessId(req) },
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      role: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  res.json({
    data: {
      items: memberships.map((membership) => ({
        id: membership.id,
        active: membership.active,
        createdAt: membership.createdAt,
        user: membership.user,
        role: membership.role,
      })),
    },
  });
}));

router.post('/staff', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const tenantId = businessId(req);
  const input = memberInputSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.initialPassword, 12);
  try {
    const membership = await prisma.$transaction(async (tx) => {
      await assertPlanLimit(tx, tenantId, 'staff:manage');
      const role = await tx.role.findFirst({
        where: { id: input.roleId, businessId: tenantId },
        include: { grants: { include: { permission: { select: { key: true } } } } },
      });
      if (!role) throw new HttpError(400, 'Choose a role belonging to this business', 'INVALID_BUSINESS_ROLE');
      if (role.name === 'Owner') throw new HttpError(403, 'The owner role can only be assigned by platform onboarding', 'BUSINESS_OWNER_REQUIRED');
      validateGrants(role.grants.map((grant) => grant.permission.key), req.auth!.permissions);
      const existing = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (existing) throw new HttpError(409, 'An account with this email already exists', 'USER_EMAIL_IN_USE');
      const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
      const created = await tx.membership.create({
        data: { businessId: tenantId, userId: user.id, roleId: role.id },
        include: { role: { select: { id: true, name: true } } },
      });
      await writeAudit(tx, req, tenantId, 'business.staff_created', 'membership', created.id, {
        email: input.email,
        role: role.name,
      });
      return {
        id: created.id,
        active: created.active,
        createdAt: created.createdAt,
        user: { id: user.id, name: user.name, email: user.email, active: user.active },
        role: created.role,
      };
    });
    res.status(201).json({ data: membership });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'This user is already a member of the business', 'BUSINESS_MEMBERSHIP_EXISTS');
    }
    throw error;
  }
}));

router.patch('/staff/:membershipId', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const tenantId = businessId(req);
  const membershipId = idSchema.parse(req.params.membershipId);
  const input = memberUpdateSchema.parse(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.membership.findFirst({
      where: { id: membershipId, businessId: tenantId },
      include: { role: { select: { name: true } } },
    });
    if (!current) throw new HttpError(404, 'Business membership not found', 'BUSINESS_MEMBERSHIP_NOT_FOUND');
    if (current.role.name === 'Owner' && input.active === false) {
      throw new HttpError(403, 'The business owner membership cannot be deactivated', 'BUSINESS_OWNER_REQUIRED');
    }
    if (input.roleId) {
      const role = await tx.role.findFirst({
        where: { id: input.roleId, businessId: tenantId },
        include: { grants: { include: { permission: { select: { key: true } } } } },
      });
      if (!role) throw new HttpError(400, 'Choose a role belonging to this business', 'INVALID_BUSINESS_ROLE');
      validateGrants(role.grants.map((grant) => grant.permission.key), req.auth!.permissions);
      if (current.role.name === 'Owner' && role.name !== 'Owner') {
        throw new HttpError(403, 'The business owner role cannot be reassigned', 'BUSINESS_OWNER_REQUIRED');
      }
      if (current.role.name !== 'Owner' && role.name === 'Owner') {
        throw new HttpError(403, 'The owner role can only be assigned by platform onboarding', 'BUSINESS_OWNER_REQUIRED');
      }
    }
    if (input.active === true && !current.active) {
      await assertPlanLimit(tx, tenantId, 'staff:manage');
    }
    const membership = await tx.membership.update({
      where: { id: current.id },
      data: { ...(input.roleId ? { roleId: input.roleId } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        role: { select: { id: true, name: true } },
      },
    });
    await writeAudit(tx, req, tenantId, 'business.staff_updated', 'membership', membership.id, {
      ...(input.roleId ? { roleId: input.roleId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
    return membership;
  });
  res.json({
    data: {
      id: updated.id,
      active: updated.active,
      createdAt: updated.createdAt,
      user: updated.user,
      role: updated.role,
    },
  });
}));

router.delete('/staff/:membershipId', requireBusinessPermission('staff:manage'), asyncHandler(async (req, res) => {
  const tenantId = businessId(req);
  const membershipId = idSchema.parse(req.params.membershipId);
  const input = memberRemovalSchema.parse(req.body ?? {});
  const removed = await prisma.$transaction(async (tx) => {
    const current = await tx.membership.findFirst({
      where: { id: membershipId, businessId: tenantId },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        role: { select: { id: true, name: true } },
      },
    });
    if (!current) throw new HttpError(404, 'Business membership not found', 'BUSINESS_MEMBERSHIP_NOT_FOUND');
    if (current.role.name === 'Owner') {
      throw new HttpError(403, 'The business owner cannot be removed from the business', 'BUSINESS_OWNER_REQUIRED');
    }
    if (current.userId === req.auth!.userId) {
      throw new HttpError(409, 'You cannot remove your own business access', 'SELF_REMOVAL_DENIED');
    }
    await tx.refreshToken.updateMany({
      where: { membershipId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const membership = await tx.membership.update({
      where: { id: membershipId },
      data: { active: false },
      include: {
        user: { select: { id: true, name: true, email: true, active: true } },
        role: { select: { id: true, name: true } },
      },
    });
    await writeAudit(tx, req, tenantId, 'business.staff_removed', 'membership', membershipId, {
      email: current.user.email,
      role: current.role.name,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return membership;
  });
  res.json({
    data: {
      id: removed.id,
      active: removed.active,
      createdAt: removed.createdAt,
      user: removed.user,
      role: removed.role,
    },
  });
}));

export default router;
