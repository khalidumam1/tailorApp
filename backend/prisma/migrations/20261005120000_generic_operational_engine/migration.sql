BEGIN;

ALTER TABLE "WorkflowStage"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "BusinessTemplate"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Order"
  ADD COLUMN "workflowStageId" UUID,
  ADD COLUMN "workflowStageKey" VARCHAR(80);

ALTER TABLE "OrderItem"
  ADD COLUMN "businessId" UUID,
  ADD COLUMN "itemId" UUID,
  ADD COLUMN "itemTypeKey" VARCHAR(80) NOT NULL DEFAULT 'garment',
  ADD COLUMN "itemName" VARCHAR(160);

UPDATE "OrderItem" oi
SET "businessId" = o."businessId",
    "itemName" = oi."garmentName"
FROM "Order" o
WHERE o."id" = oi."orderId";

ALTER TABLE "OrderItem"
  ALTER COLUMN "businessId" SET NOT NULL;

CREATE TABLE "BusinessItem" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "typeKey" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(2000),
  "sku" VARCHAR(80),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BusinessItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessItem_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BusinessItem_id_businessId_key" ON "BusinessItem"("id", "businessId");
CREATE UNIQUE INDEX "BusinessItem_businessId_sku_key" ON "BusinessItem"("businessId", "sku");
CREATE INDEX "BusinessItem_businessId_typeKey_active_name_idx"
  ON "BusinessItem"("businessId", "typeKey", "active", "name");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderItem_orderId_businessId_fkey"
    FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderItem_itemId_businessId_fkey"
    FOREIGN KEY ("itemId", "businessId") REFERENCES "BusinessItem"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "OrderItem_id_businessId_key" ON "OrderItem"("id", "businessId");
CREATE INDEX "OrderItem_businessId_itemTypeKey_idx" ON "OrderItem"("businessId", "itemTypeKey");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_workflowStageId_fkey"
    FOREIGN KEY ("workflowStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_businessId_workflowStageId_updatedAt_idx"
  ON "Order"("businessId", "workflowStageId", "updatedAt");

CREATE TABLE "OrderWorkflowHistory" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "fromStageId" UUID,
  "toStageId" UUID,
  "fromStageKey" VARCHAR(80),
  "toStageKey" VARCHAR(80) NOT NULL,
  "fromStageLabel" VARCHAR(120),
  "toStageLabel" VARCHAR(120) NOT NULL,
  "changedById" UUID NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderWorkflowHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderWorkflowHistory_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderWorkflowHistory_orderId_businessId_fkey"
    FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderWorkflowHistory_fromStageId_fkey"
    FOREIGN KEY ("fromStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OrderWorkflowHistory_toStageId_fkey"
    FOREIGN KEY ("toStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OrderWorkflowHistory_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OrderWorkflowHistory_businessId_orderId_createdAt_idx"
  ON "OrderWorkflowHistory"("businessId", "orderId", "createdAt");

CREATE TABLE "CustomFieldValue" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "fieldDefinitionId" UUID NOT NULL,
  "customerId" UUID,
  "orderId" UUID,
  "orderItemId" UUID,
  "itemId" UUID,
  "valueText" TEXT,
  "valueNumber" DECIMAL(20,6),
  "valueBoolean" BOOLEAN,
  "valueDate" TIMESTAMPTZ(3),
  "valueJson" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomFieldValue_one_owner_check" CHECK (
    ("customerId" IS NOT NULL)::int
    + ("orderId" IS NOT NULL)::int
    + ("orderItemId" IS NOT NULL)::int
    + ("itemId" IS NOT NULL)::int = 1
  ),
  CONSTRAINT "CustomFieldValue_one_value_check" CHECK (
    ("valueText" IS NOT NULL)::int
    + ("valueNumber" IS NOT NULL)::int
    + ("valueBoolean" IS NOT NULL)::int
    + ("valueDate" IS NOT NULL)::int
    + ("valueJson" IS NOT NULL)::int = 1
  ),
  CONSTRAINT "CustomFieldValue_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_fieldDefinitionId_fkey"
    FOREIGN KEY ("fieldDefinitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_customerId_businessId_fkey"
    FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_orderId_businessId_fkey"
    FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_orderItemId_businessId_fkey"
    FOREIGN KEY ("orderItemId", "businessId") REFERENCES "OrderItem"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_itemId_businessId_fkey"
    FOREIGN KEY ("itemId", "businessId") REFERENCES "BusinessItem"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomFieldValue_customerId_fieldDefinitionId_key"
  ON "CustomFieldValue"("customerId", "fieldDefinitionId");
CREATE UNIQUE INDEX "CustomFieldValue_orderId_fieldDefinitionId_key"
  ON "CustomFieldValue"("orderId", "fieldDefinitionId");
CREATE UNIQUE INDEX "CustomFieldValue_orderItemId_fieldDefinitionId_key"
  ON "CustomFieldValue"("orderItemId", "fieldDefinitionId");
CREATE UNIQUE INDEX "CustomFieldValue_itemId_fieldDefinitionId_key"
  ON "CustomFieldValue"("itemId", "fieldDefinitionId");
CREATE INDEX "CustomFieldValue_businessId_fieldDefinitionId_idx"
  ON "CustomFieldValue"("businessId", "fieldDefinitionId");

UPDATE "WorkflowStage" SET "key" = 'FITTING', "label" = 'Fitting'
WHERE "templateId" = (SELECT "id" FROM "BusinessTemplate" WHERE "key" = 'tailor')
  AND "key" = 'FINISHING';
UPDATE "WorkflowStage" SET "label" = 'Ready'
WHERE "templateId" = (SELECT "id" FROM "BusinessTemplate" WHERE "key" = 'tailor')
  AND "key" = 'READY_FOR_PICKUP';
UPDATE "WorkflowStage" SET "label" = 'Completed'
WHERE "templateId" = (SELECT "id" FROM "BusinessTemplate" WHERE "key" = 'tailor')
  AND "key" = 'COLLECTED';

UPDATE "BusinessTemplate"
SET "itemTypes" = '[{"key":"sofa","label":"Sofa"},{"key":"bed","label":"Bed"},{"key":"table","label":"Table"},{"key":"chair","label":"Chair"},{"key":"wardrobe","label":"Wardrobe"}]'
WHERE "key" = 'furniture';
UPDATE "BusinessTemplate"
SET "itemTypes" = '[{"key":"project","label":"Project / Item"}]'
WHERE "key" = 'carpenter';
UPDATE "BusinessTemplate"
SET "itemTypes" = '[{"key":"repair_job","label":"Repair Job"},{"key":"service","label":"Service"},{"key":"part","label":"Part"}]'
WHERE "key" = 'auto-workshop';
UPDATE "BusinessTemplate"
SET "itemTypes" = '[{"key":"business_card","label":"Business Card"},{"key":"banner","label":"Banner"},{"key":"flyer","label":"Flyer"}]'
WHERE "key" = 'printing';

UPDATE "Order" o
SET "workflowStageId" = s."id",
    "workflowStageKey" = s."key"
FROM "WorkflowStage" s
JOIN "Business" b ON b."templateId" = s."templateId"
WHERE b."id" = o."businessId"
  AND s."key" = CASE o."status"::text
    WHEN 'FINISHING' THEN 'FITTING'
    ELSE o."status"::text
  END;

INSERT INTO "OrderWorkflowHistory"
  ("id", "businessId", "orderId", "fromStageId", "toStageId", "fromStageKey", "toStageKey",
   "fromStageLabel", "toStageLabel", "changedById", "note", "createdAt")
SELECT md5('workflow-history:' || h."id"::text)::uuid,
       o."businessId",
       o."id",
       from_stage."id",
       to_stage."id",
       CASE h."fromStatus"::text WHEN 'FINISHING' THEN 'FITTING' ELSE h."fromStatus"::text END,
       to_stage."key",
       from_stage."label",
       to_stage."label",
       h."changedById",
       h."note",
       h."createdAt"
FROM "OrderStatusHistory" h
JOIN "Order" o ON o."id" = h."orderId"
JOIN "Business" b ON b."id" = o."businessId"
JOIN "WorkflowStage" to_stage ON to_stage."templateId" = b."templateId"
  AND to_stage."key" = CASE h."toStatus"::text
    WHEN 'FINISHING' THEN 'FITTING'
    ELSE h."toStatus"::text
  END
LEFT JOIN "WorkflowStage" from_stage ON from_stage."templateId" = to_stage."templateId"
  AND from_stage."key" = CASE h."fromStatus"::text
    WHEN 'FINISHING' THEN 'FITTING'
    ELSE h."fromStatus"::text
  END
ON CONFLICT ("id") DO NOTHING;

COMMIT;
