-- Customer order-tracking links.
--
-- A business can create one opaque, revocable link per order. The link lets a
-- customer follow that order's progress without an account, and lets the
-- customer send a fitting confirmation, a question or a change request back
-- to the shop. Nothing here changes existing order, payment or accounting
-- rows, so this migration is forward-only and reversible by dropping the two
-- new tables.

-- The permission that guards creating, rotating and revoking a tracking link.
-- The description matches backend/src/permissions.ts, which is the source of
-- truth and upserts it on every seed run.
INSERT INTO "Permission" ("id", "key", "description")
VALUES ('2bf55736-5f13-42ec-a7d7-08b9a1b3707a', 'orders:share', 'Share customer order-tracking links and answer customer messages')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Owner roles that already exist keep their order permissions, so they get
-- the new one as well. Other roles stay untouched: a shop decides who may
-- share a customer link.
INSERT INTO "RolePermissionGrant" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."name" = 'Owner'
  AND role."isSystem" = true
  AND role."businessId" IS NOT NULL
  AND permission."key" = 'orders:share'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- CreateEnum
CREATE TYPE "OrderCustomerMessageKind" AS ENUM ('FITTING_CONFIRMED', 'QUESTION', 'CHANGE_REQUESTED');

-- CreateEnum
CREATE TYPE "OrderCustomerMessageStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "OrderTrackingLink" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "lastViewedAt" TIMESTAMPTZ(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderTrackingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCustomerMessage" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "linkId" UUID,
    "kind" "OrderCustomerMessageKind" NOT NULL,
    "body" VARCHAR(1000),
    "status" "OrderCustomerMessageStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrderCustomerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderTrackingLink_token_key" ON "OrderTrackingLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OrderTrackingLink_orderId_businessId_key" ON "OrderTrackingLink"("orderId", "businessId");

-- CreateIndex
CREATE INDEX "OrderTrackingLink_businessId_createdAt_idx" ON "OrderTrackingLink"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderCustomerMessage_businessId_orderId_createdAt_idx" ON "OrderCustomerMessage"("businessId", "orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderTrackingLink" ADD CONSTRAINT "OrderTrackingLink_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTrackingLink" ADD CONSTRAINT "OrderTrackingLink_orderId_businessId_fkey" FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTrackingLink" ADD CONSTRAINT "OrderTrackingLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCustomerMessage" ADD CONSTRAINT "OrderCustomerMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCustomerMessage" ADD CONSTRAINT "OrderCustomerMessage_orderId_businessId_fkey" FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCustomerMessage" ADD CONSTRAINT "OrderCustomerMessage_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "OrderTrackingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
