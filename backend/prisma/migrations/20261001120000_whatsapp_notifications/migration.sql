CREATE TYPE "WhatsAppNotificationKind" AS ENUM ('ORDER_CREATED', 'PAYMENT_RECEIVED', 'ORDER_READY');
CREATE TYPE "WhatsAppNotificationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NOT_SENT');

ALTER TABLE "Customer"
  ADD COLUMN "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "whatsappOptedOutAt" TIMESTAMPTZ(3);

INSERT INTO "Permission" ("id", "key", "description")
VALUES ('7f4f0f2d-1b22-4eb7-b611-7b7bd1111c44', 'notifications:read', 'View customer notification delivery history')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermissionGrant" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."name" = 'Owner'
  AND role."isSystem" = true
  AND role."businessId" IS NOT NULL
  AND permission."key" = 'notifications:read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

UPDATE "Customer"
SET "phone" = '+' || substr(regexp_replace("phone", '[^0-9]', '', 'g'), 3)
WHERE regexp_replace("phone", '[^0-9]', '', 'g') ~ '^00[1-9][0-9]{7,14}$';

UPDATE "Customer"
SET "phone" = '+' || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE regexp_replace("phone", '[^0-9]', '', 'g') ~ '^[1-9][0-9]{7,14}$';

UPDATE "Customer"
SET "phone" = '+92' || substr(regexp_replace("phone", '[^0-9]', '', 'g'), 2)
WHERE regexp_replace("phone", '[^0-9]', '', 'g') ~ '^0[0-9]{9,10}$';

CREATE TABLE "WhatsAppNotification" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "paymentId" UUID,
  "kind" "WhatsAppNotificationKind" NOT NULL,
  "status" "WhatsAppNotificationStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "recipientPhone" VARCHAR(16) NOT NULL,
  "templateName" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "metaMessageId" VARCHAR(128),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" VARCHAR(500),
  "sentAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "readAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "WhatsAppNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppNotification_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppNotification_orderId_businessId_fkey" FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppNotification_paymentId_businessId_orderId_fkey" FOREIGN KEY ("paymentId", "businessId", "orderId") REFERENCES "Payment"("id", "businessId", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WhatsAppNotification_idempotencyKey_key" ON "WhatsAppNotification"("idempotencyKey");
CREATE UNIQUE INDEX "WhatsAppNotification_metaMessageId_key" ON "WhatsAppNotification"("metaMessageId");
CREATE INDEX "WhatsAppNotification_businessId_createdAt_idx" ON "WhatsAppNotification"("businessId", "createdAt");
CREATE INDEX "WhatsAppNotification_businessId_customerId_createdAt_idx" ON "WhatsAppNotification"("businessId", "customerId", "createdAt");
CREATE INDEX "WhatsAppNotification_status_nextAttemptAt_idx" ON "WhatsAppNotification"("status", "nextAttemptAt");
