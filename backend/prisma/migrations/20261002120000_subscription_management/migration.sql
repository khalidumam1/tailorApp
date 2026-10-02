CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "SubscriptionCycle" AS ENUM ('MONTHLY', 'YEARLY', 'CUSTOM');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ADJUSTED');

CREATE TABLE "SubscriptionPlan" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(1000),
  "monthlyPrice" DECIMAL(12,2) NOT NULL,
  "yearlyPrice" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
  "trialDays" INTEGER NOT NULL DEFAULT 0,
  "features" JSONB NOT NULL,
  "limits" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionPlan_active_isDefault_idx" ON "SubscriptionPlan"("active", "isDefault");
CREATE UNIQUE INDEX "SubscriptionPlan_single_default_idx" ON "SubscriptionPlan"("isDefault") WHERE "isDefault" = true;

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL,
  "cycle" "SubscriptionCycle" NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "graceUntil" TIMESTAMPTZ(3) NOT NULL,
  "customPrice" DECIMAL(12,2),
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "complimentary" BOOLEAN NOT NULL DEFAULT false,
  "grandfathered" BOOLEAN NOT NULL DEFAULT false,
  "suspendedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Subscription_businessId_status_endsAt_idx" ON "Subscription"("businessId", "status", "endsAt");
CREATE INDEX "Subscription_endsAt_status_idx" ON "Subscription"("endsAt", "status");
CREATE UNIQUE INDEX "Subscription_one_current_per_business_idx" ON "Subscription"("businessId") WHERE "status" IN ('TRIAL', 'ACTIVE');

CREATE TABLE "SubscriptionPayment" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "subscriptionId" UUID,
  "submittedById" UUID NOT NULL,
  "reviewedById" UUID,
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "cycle" "SubscriptionCycle" NOT NULL,
  "transactionReference" VARCHAR(120) NOT NULL,
  "senderName" VARCHAR(160) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" VARCHAR(60) NOT NULL,
  "paymentDate" DATE NOT NULL,
  "customPrice" DECIMAL(12,2),
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "invoiceNumber" VARCHAR(60),
  "rejectionReason" VARCHAR(1000),
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionPayment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionPayment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubscriptionPayment_transactionReference_key" ON "SubscriptionPayment"("transactionReference");
CREATE UNIQUE INDEX "SubscriptionPayment_invoiceNumber_key" ON "SubscriptionPayment"("invoiceNumber");
CREATE INDEX "SubscriptionPayment_businessId_status_createdAt_idx" ON "SubscriptionPayment"("businessId", "status", "createdAt");
CREATE INDEX "SubscriptionPayment_status_paymentDate_idx" ON "SubscriptionPayment"("status", "paymentDate");

CREATE TABLE "SubscriptionEvent" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "subscriptionId" UUID,
  "paymentId" UUID,
  "actorId" UUID,
  "action" VARCHAR(100) NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubscriptionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SubscriptionEvent_businessId_createdAt_idx" ON "SubscriptionEvent"("businessId", "createdAt");
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");
CREATE INDEX "SubscriptionEvent_paymentId_createdAt_idx" ON "SubscriptionEvent"("paymentId", "createdAt");

CREATE TABLE "PlatformSetting" (
  "key" VARCHAR(120) NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "SubscriptionPlan"
  ("id", "name", "description", "monthlyPrice", "yearlyPrice", "trialDays", "features", "limits", "active", "isDefault", "updatedAt")
VALUES
  ('a6c4a3c7-364f-4e3e-9cbe-351219711101', 'Starter', 'Starter plan with a trial period', 0, 0, 14,
   '{"customers":true,"measurements":true,"orders":true,"payments":true,"staff":true,"reports":true}'::jsonb,
   '{"customers":-1,"staff":-1,"ordersPerMonth":-1}'::jsonb, true, true, CURRENT_TIMESTAMP),
  ('a6c4a3c7-364f-4e3e-9cbe-351219711102', 'Legacy complimentary access', 'Compatibility access for businesses that existed before subscriptions', 0, 0, 0,
   '{"customers":true,"measurements":true,"orders":true,"payments":true,"staff":true,"reports":true}'::jsonb,
   '{"customers":-1,"staff":-1,"ordersPerMonth":-1}'::jsonb, false, false, CURRENT_TIMESTAMP);

-- Keep current shops operational after deployment; admins can later assign a paid plan.
INSERT INTO "Subscription" ("id", "businessId", "planId", "status", "cycle", "startsAt", "endsAt", "graceUntil", "complimentary", "grandfathered", "updatedAt")
SELECT gen_random_uuid(), b."id", 'a6c4a3c7-364f-4e3e-9cbe-351219711102', 'ACTIVE', 'CUSTOM',
       CURRENT_TIMESTAMP, '2099-12-31 23:59:59+00', '2099-12-31 23:59:59+00', true, true, CURRENT_TIMESTAMP
FROM "Business" b;

INSERT INTO "PlatformSetting" ("key", "value", "updatedAt") VALUES
  ('billing', '{"paymentMethods":["BANK TRANSFER","EASYPAISA","JAZZCASH","CASH"],"paymentInstructions":"","gracePeriodDays":7,"expiryReminderDays":[14,7,3,1],"enforcementEnabled":true,"supportContact":""}'::jsonb, CURRENT_TIMESTAMP);

INSERT INTO "Permission" ("id", "key", "description") VALUES
 ('d1200000-0000-4000-8000-000000000001', 'subscriptions:read', 'View subscription and payment history'),
 ('d1200000-0000-4000-8000-000000000002', 'subscriptions:manage', 'Request plans and submit subscription payments'),
 ('d1200000-0000-4000-8000-000000000003', 'platform:subscriptions:read', 'View subscription dashboard and business subscriptions'),
 ('d1200000-0000-4000-8000-000000000004', 'platform:plans:manage', 'Manage subscription plans'),
 ('d1200000-0000-4000-8000-000000000005', 'platform:payments:review', 'Review subscription payment submissions'),
 ('d1200000-0000-4000-8000-000000000006', 'platform:subscriptions:manage', 'Manage business subscription lifecycle'),
 ('d1200000-0000-4000-8000-000000000007', 'platform:billing:settings', 'Manage billing instructions and settings'),
 ('d1200000-0000-4000-8000-000000000008', 'platform:reports:read', 'View subscription and payment reports')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermissionGrant" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Owner' AND r."isSystem" = true AND r."businessId" IS NOT NULL
  AND p."key" IN ('subscriptions:read', 'subscriptions:manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "PlatformPermissionGrant" ("userId", "permissionId")
SELECT u."id", p."id" FROM "User" u CROSS JOIN "Permission" p
WHERE u."platformRole" = 'SUPER_ADMIN'
  AND p."key" IN ('platform:subscriptions:read', 'platform:plans:manage',
    'platform:payments:review', 'platform:subscriptions:manage',
    'platform:billing:settings', 'platform:reports:read')
ON CONFLICT ("userId", "permissionId") DO NOTHING;
