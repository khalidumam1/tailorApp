/**
 * Backfill platform permission grants for super admins.
 *
 * Why this exists
 * ---------------
 * Navigation items in the platform console are hidden unless the signed-in
 * account holds the matching `PlatformPermissionGrant` row. Grants are only
 * written when an account is created: by `prisma/seed.ts` or by
 * `scripts/bootstrap-platform-admin.ts`. When a release adds a new platform
 * permission (for example `platform:billing:settings`), accounts created before
 * that release keep working but never receive the new grant — so the new
 * screens silently disappear from their sidebar with no error anywhere.
 *
 * This script reconciles reality with the permission catalog in
 * `src/permissions.ts`: every super admin ends up holding every platform
 * permission. It is idempotent and only ever adds grants, never removes one.
 *
 * Usage
 * -----
 *   npm run platform:grants:backfill                 # repair every super admin
 *   npm run platform:grants:backfill -- --check      # report only, change nothing
 *   npm run platform:grants:backfill -- --email=a@b.c  # repair a single account
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadEnvironmentFile } from '../src/environment.js';
import { platformPermissions } from '../src/permissions.js';

loadEnvironmentFile();

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const emailArgument = [...args].find((argument) => argument.startsWith('--email='));
const emailFilter = emailArgument?.slice('--email='.length).trim().toLowerCase();

async function backfill(): Promise<void> {
  const admins = await prisma.user.findMany({
    where: {
      platformRole: 'SUPER_ADMIN',
      ...(emailFilter ? { email: emailFilter } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      platformPermissions: { select: { permission: { select: { key: true } } } },
    },
    orderBy: { email: 'asc' },
  });

  if (admins.length === 0) {
    console.info(emailFilter
      ? `No super admin matches ${emailFilter}.`
      : 'No super admin accounts found — nothing to backfill.');
    return;
  }

  // Make sure every catalog permission exists as a Permission row.
  for (const [key, description] of platformPermissions) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  let repairedAccounts = 0;
  let addedGrants = 0;

  for (const admin of admins) {
    const held = new Set(admin.platformPermissions.map(({ permission }) => permission.key));
    const missing = platformPermissions
      .map(([key]) => key)
      .filter((key) => !held.has(key));

    if (missing.length === 0) {
      console.info(`✓ ${admin.email} already holds all ${platformPermissions.length} permissions`);
      continue;
    }

    console.info(`${checkOnly ? '!' : '+'} ${admin.email} is missing ${missing.length}: ${missing.join(', ')}`);
    repairedAccounts += 1;
    addedGrants += missing.length;
    if (checkOnly) continue;

    const permissions = await prisma.permission.findMany({
      where: { key: { in: missing } },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.platformPermissionGrant.createMany({
        data: permissions.map((permission) => ({ userId: admin.id, permissionId: permission.id })),
      });
      await tx.auditEvent.create({
        data: {
          actorId: admin.id,
          action: 'platform.super_admin_grants_backfilled',
          entityType: 'user',
          entityId: admin.id,
          metadata: { grantedPermissions: missing },
          requestId: randomUUID(),
        },
      });
    });
    console.info(`  granted ${missing.length} permission(s)`);
  }

  if (checkOnly) {
    console.info(`\nCheck complete: ${repairedAccounts} of ${admins.length} account(s) need ${addedGrants} grant(s).`);
    if (repairedAccounts > 0) process.exitCode = 1;
    return;
  }
  console.info(`\nBackfill complete: ${addedGrants} grant(s) restored across ${repairedAccounts} account(s).`);
}

backfill()
  .catch((error: unknown) => {
    console.error('Platform grant backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
