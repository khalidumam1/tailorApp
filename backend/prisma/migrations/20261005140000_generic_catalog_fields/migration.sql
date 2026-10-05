BEGIN;

ALTER TABLE "BusinessItem"
  ADD COLUMN "unit" VARCHAR(40) NOT NULL DEFAULT 'unit',
  ADD COLUMN "unitPrice" DECIMAL(12,2),
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "BusinessItem_businessId_active_sortOrder_name_idx"
  ON "BusinessItem"("businessId", "active", "sortOrder", "name");
CREATE INDEX "BusinessItem_businessId_typeKey_active_sortOrder_idx"
  ON "BusinessItem"("businessId", "typeKey", "active", "sortOrder");

UPDATE "BusinessTemplate"
SET "enabledModules" = array_append("enabledModules", 'catalog'),
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isSystem" = TRUE
  AND NOT ('catalog' = ANY("enabledModules"));

COMMIT;
