-- Create the three pricing tiers the marketing site publishes.
--
-- How to run
--   psql "$DATABASE_URL" -f backend/scripts/seed-plans.sql
--   (or paste it into any SQL client connected to the database)
--
-- Why this is needed
--   A fresh database has exactly one active plan: the migration's "Starter",
--   priced 0 with unlimited limits — a trial plan, not a paid tier
--   (20261002120000_subscription_management). The marketing site publishes
--   three tiers, and the signup form loads its plan list from the API, so
--   without this a buyer can see Growth and Scale on the pricing table and
--   then find only Starter in the dropdown.
--
--   This brings the plan table in line with the published prices:
--
--     Starter  Rs 2,500 / month   3 staff, 200 customers, 100 orders
--     Growth   Rs 6,000 / month  10 staff, 2,000 customers, 1,000 orders
--     Scale    Rs 15,000 / month 30 staff, unlimited customers, 5,000 orders
--
--   The figures are the proposal in docs/business/SELF_SERVE_SAAS.md. If the
--   prices change, change them here as well — this script is idempotent, so
--   running it again applies the edits.
--
-- How the columns are read
--   limits   { customers | staff | ordersPerMonth | catalogItems } — a number,
--            and anything below 0 means unlimited (src/plan-limits.ts).
--            `staff` counts memberships excluding the Owner, so "3 staff"
--            means three people besides the owner.
--   features module name -> boolean. A module is blocked only when its key is
--            explicitly false; a missing key is allowed (middleware/auth.ts).
--            These rows therefore name every module, so the tier boundary is
--            written down rather than implied.
--
-- Safety
--   * Idempotent — safe to run repeatedly; it updates by name and only inserts
--     a tier when it is missing.
--   * It never deletes a plan, and never moves the default: Starter stays
--     isDefault, which the unique index requires to be a single row.
--   * Existing businesses keep the plan they are on. Changing a plan's limits
--     changes them for everyone on that plan, so check the platform console's
--     plan list before running this against a database with live customers.

BEGIN;

-- 1. Starter: the trial plan becomes the paid entry tier.
UPDATE "SubscriptionPlan"
   SET "description" = 'For one owner and a small team',
       "monthlyPrice" = 2500,
       "yearlyPrice" = 25000,
       "trialDays" = 14,
       "features" = '{
         "customers": true, "orders": true, "catalog": true, "measurements": true,
         "payments": true, "reports": true, "staff": true,
         "notifications": false, "inventory": false,
         "suppliers": false, "purchasing": false, "cashbook": false, "accounting": false
       }'::jsonb,
       "limits" = '{"customers": 200, "staff": 3, "ordersPerMonth": 100, "catalogItems": -1}'::jsonb,
       "active" = true,
       "updatedAt" = now()
 WHERE "name" = 'Starter';

-- 2. Growth
INSERT INTO "SubscriptionPlan"
  ("id", "name", "description", "monthlyPrice", "yearlyPrice", "currency", "trialDays",
   "features", "limits", "active", "isDefault", "updatedAt")
SELECT
  md5('platform-plan:growth')::uuid,
  'Growth',
  'A shop with staff and stock',
  6000,
  60000,
  'PKR',
  14,
  '{
    "customers": true, "orders": true, "catalog": true, "measurements": true,
    "payments": true, "reports": true, "staff": true,
    "notifications": true, "inventory": true,
    "suppliers": false, "purchasing": false, "cashbook": false, "accounting": false
  }'::jsonb,
  '{"customers": 2000, "staff": 10, "ordersPerMonth": 1000, "catalogItems": -1}'::jsonb,
  true,
  false,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "name" = 'Growth');

-- 3. Scale
INSERT INTO "SubscriptionPlan"
  ("id", "name", "description", "monthlyPrice", "yearlyPrice", "currency", "trialDays",
   "features", "limits", "active", "isDefault", "updatedAt")
SELECT
  md5('platform-plan:scale')::uuid,
  'Scale',
  'Buys, sells and keeps books',
  15000,
  150000,
  'PKR',
  14,
  '{
    "customers": true, "orders": true, "catalog": true, "measurements": true,
    "payments": true, "reports": true, "staff": true,
    "notifications": true, "inventory": true,
    "suppliers": true, "purchasing": true, "cashbook": true, "accounting": true
  }'::jsonb,
  '{"customers": -1, "staff": 30, "ordersPerMonth": 5000, "catalogItems": -1}'::jsonb,
  true,
  false,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "name" = 'Scale');

COMMIT;

-- To see what the site will offer:
--
--   SELECT "name", "monthlyPrice", "yearlyPrice", "trialDays", "limits", "active", "isDefault"
--     FROM "SubscriptionPlan" ORDER BY "isDefault" DESC, "monthlyPrice" ASC;
