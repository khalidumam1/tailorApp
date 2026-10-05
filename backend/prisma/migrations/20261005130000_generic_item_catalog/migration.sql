BEGIN;

CREATE UNIQUE INDEX "BusinessItem_businessId_typeKey_name_key"
  ON "BusinessItem"("businessId", "typeKey", "name");

INSERT INTO "BusinessItem" ("id", "businessId", "typeKey", "name", "updatedAt")
SELECT md5("businessId"::text || ':' || "itemTypeKey" || ':' || "itemName")::uuid,
       "businessId", "itemTypeKey", "itemName", CURRENT_TIMESTAMP
FROM "OrderItem"
WHERE "itemName" IS NOT NULL
GROUP BY "businessId", "itemTypeKey", "itemName"
ON CONFLICT ("businessId", "typeKey", "name") DO NOTHING;

UPDATE "OrderItem" oi
SET "itemId" = bi."id"
FROM "BusinessItem" bi
WHERE oi."businessId" = bi."businessId"
  AND oi."itemTypeKey" = bi."typeKey"
  AND oi."itemName" = bi."name";

COMMIT;
