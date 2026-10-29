-- Restore platform permission grants for super admin accounts.
--
-- Runbook: "Super admin is missing platform grants" (missing screens, or the
-- console banner: "This super admin account is missing N platform grant(s)").
--
-- Why this is needed
--   Platform console screens are only shown when the signed-in account holds a
--   PlatformPermissionGrant row. Grants are written once, when the account is
--   created (prisma/seed.ts or scripts/bootstrap-platform-admin.ts). When a
--   release adds a permission to the catalog in src/permissions.ts, existing
--   super admins never receive it and the new screens silently disappear.
--
--   `npm run db:seed` cannot repair this in production: it throws
--   "Demo seed data cannot be created in production" and, outside production, it
--   creates demo businesses you do not want. Use this script instead.
--
-- How to run
--   psql "$DATABASE_URL" -f backend/scripts/backfill-platform-grants.sql
--   (or paste it into any SQL client connected to the database)
--
-- Safety
--   * Idempotent — safe to run repeatedly.
--   * Add-only — it never deletes or revokes an existing grant.
--   * It also works when the runtime image has no dev dependencies, which is
--     why this SQL exists alongside scripts/backfill-platform-grants.ts.

BEGIN;

-- 1. Make sure every permission in the catalog exists as a row.
--    The id is derived from the key so this is repeatable; existing rows keep
--    the id Prisma generated and only get their description refreshed.
INSERT INTO "Permission" ("id", "key", "description")
SELECT md5('platform-permission:' || v.key)::uuid, v.key, v.description
FROM (VALUES
  ('platform:businesses:read',       'View all businesses'),
  ('platform:businesses:manage',     'Create, activate and suspend businesses'),
  ('platform:templates:manage',      'Create and customize business templates'),
  ('platform:staff:manage',          'Manage platform staff and their explicit grants'),
  ('platform:audit:read',            'View platform-wide audit history'),
  ('platform:system:health',         'View platform system health'),
  ('platform:subscriptions:read',    'View subscription dashboard and business subscriptions'),
  ('platform:plans:manage',          'Manage subscription plans'),
  ('platform:payments:review',       'Review subscription payment submissions'),
  ('platform:subscriptions:manage',  'Manage business subscription lifecycle'),
  ('platform:billing:settings',      'Manage billing instructions and settings'),
  ('platform:application:manage',    'Manage global product branding and appearance'),
  ('platform:reports:read',          'View subscription and payment reports')
) AS v(key, description)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- 2. Grant every platform permission to every super admin that does not hold
--    it yet. Platform staff accounts are untouched.
INSERT INTO "PlatformPermissionGrant" ("userId", "permissionId")
SELECT u."id", p."id"
FROM "User" u
CROSS JOIN "Permission" p
WHERE u."platformRole" = 'SUPER_ADMIN'
  AND p."key" LIKE 'platform:%'
  AND NOT EXISTS (
    SELECT 1
    FROM "PlatformPermissionGrant" g
    WHERE g."userId" = u."id"
      AND g."permissionId" = p."id"
  );

COMMIT;

-- 3. Verify: every super admin should report 13 grants.
SELECT u."email",
       count(g."permissionId") AS "grantCount",
       13 - count(g."permissionId") AS "missing"
FROM "User" u
LEFT JOIN "PlatformPermissionGrant" g
  ON g."userId" = u."id"
 AND g."permissionId" IN (SELECT "id" FROM "Permission" WHERE "key" LIKE 'platform:%')
WHERE u."platformRole" = 'SUPER_ADMIN'
GROUP BY u."email"
ORDER BY u."email";
