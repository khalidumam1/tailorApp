import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { loadEnvironmentFile } from '../src/environment.js';
import { platformPermissions } from '../src/permissions.js';

loadEnvironmentFile();

const prisma = new PrismaClient();

async function bootstrap() {
  const emailResult = z.string().email().max(254).safeParse(process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase());
  const email = emailResult.success ? emailResult.data : undefined;
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  if (process.env.NODE_ENV !== 'production' || process.env.BOOTSTRAP_SUPER_ADMIN !== 'true') {
    throw new Error('Bootstrap requires NODE_ENV=production and BOOTSTRAP_SUPER_ADMIN=true');
  }
  if (!email || !password || password.length < 20 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Provide a platform admin email and a unique password of at least 20 characters');
  }

  const admin = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(74022026)`;
    const existingAdmins = await tx.user.count({ where: { platformRole: 'SUPER_ADMIN' } });
    if (existingAdmins > 0) {
      throw new Error('A super admin already exists; bootstrap is one-time only');
    }
    const user = await tx.user.create({
      data: {
        email,
        name: 'Platform Super Admin',
        passwordHash: await bcrypt.hash(password, 12),
        platformRole: 'SUPER_ADMIN',
      },
    });
    for (const [key, description] of platformPermissions) {
      const permission = await tx.permission.upsert({
        where: { key },
        update: {},
        create: { key, description },
      });
      await tx.platformPermissionGrant.create({ data: { userId: user.id, permissionId: permission.id } });
    }
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: 'platform.super_admin_bootstrapped',
        entityType: 'user',
        entityId: user.id,
        metadata: { grantedPermissionCount: platformPermissions.length },
        requestId: randomUUID(),
      },
    });
    return user;
  });
  console.info(`Platform Super Admin bootstrap completed for ${admin.email}. Remove bootstrap variables now.`);
}

bootstrap()
  .catch((error: unknown) => {
    console.error('Platform Super Admin bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
