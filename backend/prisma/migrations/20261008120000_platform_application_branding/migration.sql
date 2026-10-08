INSERT INTO "Permission" ("id", "key", "description")
VALUES (
  'd1300000-0000-4000-8000-000000000001',
  'platform:application:manage',
  'Manage global product branding and appearance'
)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "PlatformPermissionGrant" ("userId", "permissionId")
SELECT u."id", p."id"
FROM "User" u
CROSS JOIN "Permission" p
WHERE u."platformRole" = 'SUPER_ADMIN'
  AND p."key" = 'platform:application:manage'
ON CONFLICT ("userId", "permissionId") DO NOTHING;

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt") VALUES
  (
    'application-branding',
    '{"brandName":"TailorApp","tagline":"Made for the workroom","description":"Keep customers, measurements, stitching progress and payments in one clear place.","loginTitle":"Good work starts with a good fit.","logoUrl":"","faviconUrl":"","primaryColor":"#117a5c","accentColor":"#c08a33","defaultTheme":"light","supportEmail":"","supportUrl":"","footerText":""}'::jsonb,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO NOTHING;
