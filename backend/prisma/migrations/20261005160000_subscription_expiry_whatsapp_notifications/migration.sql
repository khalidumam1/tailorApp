ALTER TYPE "WhatsAppNotificationKind" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EXPIRING';

ALTER TABLE "BusinessConfiguration"
  ADD COLUMN "contactPhone" VARCHAR(32);

ALTER TABLE "WhatsAppNotification"
  ALTER COLUMN "customerId" DROP NOT NULL,
  ALTER COLUMN "orderId" DROP NOT NULL,
  ADD COLUMN "recipientName" VARCHAR(160);
