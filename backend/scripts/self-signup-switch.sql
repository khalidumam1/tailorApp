-- Switch public self-signup on or off.
--
-- How to run
--   psql "$DATABASE_URL" -f backend/scripts/self-signup-switch.sql
--   (or paste it into any SQL client connected to the database)
--
-- Why this is needed
--   POST /api/v1/public/signup creates a business, its owner and a trial
--   subscription with no authentication at all. That endpoint is off until
--   this setting says otherwise: a missing row, a null value, or
--   {"enabled": false} all leave it switched off, returning 403
--   SELF_SIGNUP_DISABLED. So deploying the code is safe on its own — the
--   endpoint only opens when you run this.
--
--   Turning it on is the moment the marketing site's signup form starts
--   working, so do it after the site is deployed and CORS_ORIGINS on the API
--   includes the site's origin.
--
-- Safety
--   * Idempotent — safe to run repeatedly.
--   * It only writes the one PlatformSetting row.
--   * Switching it off does not delete anything; existing businesses and
--     trials keep working, the endpoint simply stops creating new ones.

BEGIN;

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('signup', '{"enabled": true}'::json, now())
ON CONFLICT ("key") DO UPDATE
  SET "value" = '{"enabled": true}'::json,
      "updatedAt" = now();

COMMIT;

-- To switch it off again:
--
--   UPDATE "PlatformSetting"
--      SET "value" = '{"enabled": false}'::json,
--          "updatedAt" = now()
--    WHERE "key" = 'signup';
--
-- To check the current state:
--
--   SELECT "key", "value", "updatedAt" FROM "PlatformSetting" WHERE "key" = 'signup';
