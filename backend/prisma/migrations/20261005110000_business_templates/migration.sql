CREATE TABLE "BusinessTemplate" (
  "id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "description" VARCHAR(1000),
  "terminology" JSONB NOT NULL,
  "enabledModules" TEXT[] NOT NULL,
  "itemTypes" JSONB NOT NULL,
  "paymentMethods" TEXT[] NOT NULL,
  "dashboardWidgets" TEXT[] NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BusinessTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessTemplate_key_key" ON "BusinessTemplate"("key");
CREATE INDEX "BusinessTemplate_active_category_name_idx" ON "BusinessTemplate"("active", "category", "name");

ALTER TABLE "Business"
  ADD COLUMN "businessType" VARCHAR(80) NOT NULL DEFAULT 'TAILOR',
  ADD COLUMN "logoUrl" VARCHAR(2048),
  ADD COLUMN "templateId" UUID;

CREATE TABLE "BusinessConfiguration" (
  "businessId" UUID NOT NULL,
  "terminologyOverrides" JSONB NOT NULL DEFAULT '{}',
  "enabledModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "paymentMethods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notificationTemplates" JSONB NOT NULL DEFAULT '{}',
  "dashboardWidgets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publishedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BusinessConfiguration_pkey" PRIMARY KEY ("businessId"),
  CONSTRAINT "BusinessConfiguration_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CustomFieldDefinition" (
  "id" UUID NOT NULL,
  "templateId" UUID,
  "businessId" UUID,
  "module" VARCHAR(80) NOT NULL,
  "screen" VARCHAR(80) NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "type" VARCHAR(24) NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "defaultValue" JSONB,
  "validation" JSONB,
  "options" JSONB,
  "visibility" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomFieldDefinition_one_scope_check"
    CHECK (("templateId" IS NOT NULL)::int + ("businessId" IS NOT NULL)::int = 1),
  CONSTRAINT "CustomFieldDefinition_type_check"
    CHECK ("type" IN ('TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'DATETIME', 'DROPDOWN', 'MULTI_SELECT', 'BOOLEAN', 'MEASUREMENT', 'REFERENCE', 'NOTES')),
  CONSTRAINT "CustomFieldDefinition_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldDefinition_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomFieldDefinition_templateId_key_key" ON "CustomFieldDefinition"("templateId", "key");
CREATE UNIQUE INDEX "CustomFieldDefinition_businessId_key_key" ON "CustomFieldDefinition"("businessId", "key");
CREATE INDEX "CustomFieldDefinition_templateId_module_screen_sortOrder_idx"
  ON "CustomFieldDefinition"("templateId", "module", "screen", "sortOrder");
CREATE INDEX "CustomFieldDefinition_businessId_module_screen_sortOrder_idx"
  ON "CustomFieldDefinition"("businessId", "module", "screen", "sortOrder");

CREATE TABLE "WorkflowStage" (
  "id" UUID NOT NULL,
  "templateId" UUID,
  "businessId" UUID,
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isInitial" BOOLEAN NOT NULL DEFAULT false,
  "isTerminal" BOOLEAN NOT NULL DEFAULT false,
  "actions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowStage_one_scope_check"
    CHECK (("templateId" IS NOT NULL)::int + ("businessId" IS NOT NULL)::int = 1),
  CONSTRAINT "WorkflowStage_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkflowStage_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowStage_templateId_key_key" ON "WorkflowStage"("templateId", "key");
CREATE UNIQUE INDEX "WorkflowStage_businessId_key_key" ON "WorkflowStage"("businessId", "key");
CREATE INDEX "WorkflowStage_templateId_sortOrder_idx" ON "WorkflowStage"("templateId", "sortOrder");
CREATE INDEX "WorkflowStage_businessId_sortOrder_idx" ON "WorkflowStage"("businessId", "sortOrder");

CREATE TABLE "WorkflowTransition" (
  "id" UUID NOT NULL,
  "templateId" UUID,
  "businessId" UUID,
  "fromStageId" UUID NOT NULL,
  "toStageId" UUID NOT NULL,
  "allowedRoleKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowTransition_one_scope_check"
    CHECK (("templateId" IS NOT NULL)::int + ("businessId" IS NOT NULL)::int = 1),
  CONSTRAINT "WorkflowTransition_distinct_stages_check" CHECK ("fromStageId" <> "toStageId"),
  CONSTRAINT "WorkflowTransition_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkflowTransition_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkflowTransition_fromStageId_fkey"
    FOREIGN KEY ("fromStageId") REFERENCES "WorkflowStage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkflowTransition_toStageId_fkey"
    FOREIGN KEY ("toStageId") REFERENCES "WorkflowStage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowTransition_templateId_fromStageId_toStageId_key"
  ON "WorkflowTransition"("templateId", "fromStageId", "toStageId");
CREATE UNIQUE INDEX "WorkflowTransition_businessId_fromStageId_toStageId_key"
  ON "WorkflowTransition"("businessId", "fromStageId", "toStageId");
CREATE INDEX "WorkflowTransition_templateId_fromStageId_idx" ON "WorkflowTransition"("templateId", "fromStageId");
CREATE INDEX "WorkflowTransition_businessId_fromStageId_idx" ON "WorkflowTransition"("businessId", "fromStageId");

INSERT INTO "BusinessTemplate"
  ("id", "key", "name", "category", "description", "terminology", "enabledModules", "itemTypes", "paymentMethods", "dashboardWidgets", "isSystem", "updatedAt")
VALUES
  (md5('platform-template:tailor')::uuid, 'tailor', 'Tailor', 'SERVICE', 'Garment orders, measurements, and fittings.',
   '{"customer":"Customer","customers":"Customers","item":"Garment","items":"Garments","measurement":"Measurement","measurements":"Measurements","order":"Order","orders":"Orders","ready":"Ready for pickup"}',
   ARRAY['customers','measurements','orders','payments','reports','notifications'],
   '[{"key":"garment","label":"Garment"}]', ARRAY['CASH','BANK','DIGITAL'],
   ARRAY['newOrders','dueToday','overdue','inProgress','outstanding','collectedToday'], true, CURRENT_TIMESTAMP),
  (md5('platform-template:furniture')::uuid, 'furniture', 'Furniture', 'PRODUCT', 'Custom furniture production and delivery preparation.',
   '{"customer":"Customer","customers":"Customers","item":"Furniture Item","items":"Furniture Items","measurement":"Dimensions","measurements":"Dimensions","order":"Order","orders":"Orders","ready":"Ready"}',
   ARRAY['customers','orders','payments','reports','notifications'],
   '[{"key":"furniture_item","label":"Furniture Item"}]', ARRAY['CASH','BANK','DIGITAL'],
   ARRAY['newOrders','dueToday','overdue','inProgress','outstanding','collectedToday'], true, CURRENT_TIMESTAMP),
  (md5('platform-template:carpenter')::uuid, 'carpenter', 'Carpenter', 'SERVICE', 'Carpentry jobs, materials, and dimensions.',
   '{"customer":"Customer","customers":"Customers","item":"Project","items":"Projects","measurement":"Dimensions","measurements":"Dimensions","order":"Job","orders":"Jobs","ready":"Ready"}',
   ARRAY['customers','orders','payments','reports','notifications'],
   '[{"key":"project","label":"Project"}]', ARRAY['CASH','BANK','DIGITAL'],
   ARRAY['newOrders','dueToday','overdue','inProgress','outstanding','collectedToday'], true, CURRENT_TIMESTAMP),
  (md5('platform-template:auto-workshop')::uuid, 'auto-workshop', 'Auto Workshop', 'SERVICE', 'Vehicle inspection, estimates, and repair jobs.',
   '{"customer":"Customer","customers":"Customers","item":"Vehicle","items":"Vehicles","measurement":"Inspection","measurements":"Inspections","order":"Job","orders":"Jobs","ready":"Ready"}',
   ARRAY['customers','orders','payments','reports','notifications'],
   '[{"key":"vehicle","label":"Vehicle"}]', ARRAY['CASH','BANK','DIGITAL'],
   ARRAY['newOrders','dueToday','overdue','inProgress','outstanding','collectedToday'], true, CURRENT_TIMESTAMP),
  (md5('platform-template:printing')::uuid, 'printing', 'Printing', 'PRODUCT', 'Print jobs, specifications, and production stages.',
   '{"customer":"Customer","customers":"Customers","item":"Print Product","items":"Print Products","measurement":"Specification","measurements":"Specifications","order":"Job","orders":"Jobs","ready":"Ready"}',
   ARRAY['customers','orders','payments','reports','notifications'],
   '[{"key":"print_product","label":"Print Product"}]', ARRAY['CASH','BANK','DIGITAL'],
   ARRAY['newOrders','dueToday','overdue','inProgress','outstanding','collectedToday'], true, CURRENT_TIMESTAMP),
  (md5('platform-template:generic')::uuid, 'generic', 'Generic', 'GENERAL', 'A configurable customer, order, and payment workspace.',
   '{"customer":"Customer","customers":"Customers","item":"Item","items":"Items","measurement":"Details","measurements":"Details","order":"Order","orders":"Orders","ready":"Ready"}',
   ARRAY['customers','orders','payments','reports'],
   '[{"key":"item","label":"Item"}]', ARRAY['CASH','BANK','DIGITAL'],
   ARRAY['newOrders','dueToday','overdue','inProgress','outstanding','collectedToday'], true, CURRENT_TIMESTAMP);

WITH template_stages(template_key, position, stage_key, label, is_initial, is_terminal) AS (
  VALUES
    ('tailor', 0, 'NEW', 'New', true, false),
    ('tailor', 1, 'MEASUREMENT_CONFIRMED', 'Measurement', false, false),
    ('tailor', 2, 'CUTTING', 'Cutting', false, false),
    ('tailor', 3, 'STITCHING', 'Stitching', false, false),
    ('tailor', 4, 'FINISHING', 'Finishing', false, false),
    ('tailor', 5, 'READY_FOR_PICKUP', 'Ready for pickup', false, false),
    ('tailor', 6, 'COLLECTED', 'Completed', false, true),
    ('tailor', 99, 'CANCELLED', 'Cancelled', false, true),
    ('furniture', 0, 'NEW', 'New', true, false),
    ('furniture', 1, 'DESIGN', 'Design', false, false),
    ('furniture', 2, 'MATERIAL_CONFIRMATION', 'Material Confirmation', false, false),
    ('furniture', 3, 'PRODUCTION', 'Production', false, false),
    ('furniture', 4, 'FINISHING', 'Finishing', false, false),
    ('furniture', 5, 'READY', 'Ready', false, false),
    ('furniture', 6, 'COMPLETED', 'Completed', false, true),
    ('carpenter', 0, 'NEW', 'New', true, false),
    ('carpenter', 1, 'DESIGN', 'Design', false, false),
    ('carpenter', 2, 'MATERIAL_CONFIRMATION', 'Material Confirmation', false, false),
    ('carpenter', 3, 'PRODUCTION', 'Production', false, false),
    ('carpenter', 4, 'FINISHING', 'Finishing', false, false),
    ('carpenter', 5, 'READY', 'Ready', false, false),
    ('carpenter', 6, 'COMPLETED', 'Completed', false, true),
    ('auto-workshop', 0, 'INSPECTION', 'Inspection', true, false),
    ('auto-workshop', 1, 'ESTIMATE', 'Estimate', false, false),
    ('auto-workshop', 2, 'APPROVED', 'Approved', false, false),
    ('auto-workshop', 3, 'REPAIR', 'Repair', false, false),
    ('auto-workshop', 4, 'QUALITY_CHECK', 'Quality Check', false, false),
    ('auto-workshop', 5, 'READY', 'Ready', false, false),
    ('auto-workshop', 6, 'COMPLETED', 'Completed', false, true),
    ('printing', 0, 'NEW', 'New', true, false),
    ('printing', 1, 'DESIGN', 'Design', false, false),
    ('printing', 2, 'PRODUCTION', 'Production', false, false),
    ('printing', 3, 'FINISHING', 'Finishing', false, false),
    ('printing', 4, 'READY', 'Ready', false, false),
    ('printing', 5, 'COMPLETED', 'Completed', false, true),
    ('generic', 0, 'NEW', 'New', true, false),
    ('generic', 1, 'IN_PROGRESS', 'In progress', false, false),
    ('generic', 2, 'READY', 'Ready', false, false),
    ('generic', 3, 'COMPLETED', 'Completed', false, true)
)
INSERT INTO "WorkflowStage"
  ("id", "templateId", "key", "label", "sortOrder", "isInitial", "isTerminal", "updatedAt")
SELECT md5(s.template_key || ':' || s.stage_key)::uuid, t."id", s.stage_key, s.label, s.position,
  s.is_initial, s.is_terminal, CURRENT_TIMESTAMP
FROM template_stages s
JOIN "BusinessTemplate" t ON t."key" = s.template_key;

WITH stage_pairs AS (
  SELECT t."id" AS template_id, s."key" AS from_key, next_s."key" AS to_key
  FROM "BusinessTemplate" t
  JOIN "WorkflowStage" s ON s."templateId" = t."id"
  JOIN "WorkflowStage" next_s ON next_s."templateId" = t."id" AND next_s."sortOrder" = s."sortOrder" + 1
)
INSERT INTO "WorkflowTransition" ("id", "templateId", "fromStageId", "toStageId")
SELECT md5(p.template_id::text || ':' || p.from_key || ':' || p.to_key)::uuid, p.template_id,
  from_stage."id", to_stage."id"
FROM stage_pairs p
JOIN "WorkflowStage" from_stage ON from_stage."templateId" = p.template_id AND from_stage."key" = p.from_key
JOIN "WorkflowStage" to_stage ON to_stage."templateId" = p.template_id AND to_stage."key" = p.to_key;

INSERT INTO "WorkflowTransition" ("id", "templateId", "fromStageId", "toStageId")
SELECT md5('tailor-cancel:' || source."key")::uuid, source."templateId", source."id", cancelled."id"
FROM "WorkflowStage" source
JOIN "WorkflowStage" cancelled ON cancelled."templateId" = source."templateId" AND cancelled."key" = 'CANCELLED'
WHERE source."templateId" = md5('platform-template:tailor')::uuid
  AND source."key" <> 'CANCELLED'
  AND source."key" <> 'COLLECTED';

INSERT INTO "CustomFieldDefinition"
  ("id", "templateId", "module", "screen", "key", "label", "type", "required", "sortOrder", "updatedAt")
VALUES
  (md5('tailor:garment_name')::uuid, md5('platform-template:tailor')::uuid, 'orders', 'order-item', 'garment_name', 'Garment', 'TEXT', true, 0, CURRENT_TIMESTAMP),
  (md5('tailor:quantity')::uuid, md5('platform-template:tailor')::uuid, 'orders', 'order-item', 'quantity', 'Quantity', 'NUMBER', true, 1, CURRENT_TIMESTAMP),
  (md5('furniture:dimensions')::uuid, md5('platform-template:furniture')::uuid, 'orders', 'order-item', 'dimensions', 'Dimensions', 'MEASUREMENT', true, 0, CURRENT_TIMESTAMP),
  (md5('furniture:material')::uuid, md5('platform-template:furniture')::uuid, 'orders', 'order-item', 'material', 'Material', 'DROPDOWN', false, 1, CURRENT_TIMESTAMP),
  (md5('carpenter:dimensions')::uuid, md5('platform-template:carpenter')::uuid, 'orders', 'order-item', 'dimensions', 'Dimensions', 'MEASUREMENT', true, 0, CURRENT_TIMESTAMP),
  (md5('auto:vehicle')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'vehicle', 'Vehicle', 'REFERENCE', true, 0, CURRENT_TIMESTAMP),
  (md5('auto:inspection_notes')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'inspection_notes', 'Inspection notes', 'LONG_TEXT', false, 1, CURRENT_TIMESTAMP),
  (md5('printing:specifications')::uuid, md5('platform-template:printing')::uuid, 'orders', 'order-item', 'specifications', 'Specifications', 'LONG_TEXT', true, 0, CURRENT_TIMESTAMP);

INSERT INTO "CustomFieldDefinition"
  ("id", "templateId", "module", "screen", "key", "label", "type", "required", "defaultValue", "visibility", "sortOrder", "updatedAt")
VALUES
  (md5('tailor:measurement:chest')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'chest', 'Chest', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Shalwar Kameez","Shirt","Waistcoat","Suit","Custom"]}', 0, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:waist')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'waist', 'Waist', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Shalwar Kameez","Pant","Waistcoat","Suit","Custom"]}', 1, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:sleeve')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'sleeve', 'Sleeve', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Shalwar Kameez","Shirt","Suit"]}', 2, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:length')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'length', 'Length', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Shalwar Kameez","Shirt","Waistcoat","Custom"]}', 3, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:shalwar_length')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'shalwar_length', 'Shalwar Length', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Shalwar Kameez"]}', 4, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:neck')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'neck', 'Neck', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Shirt"]}', 5, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:hip')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'hip', 'Hip', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Pant"]}', 6, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:inseam')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'inseam', 'Inseam', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Pant","Suit"]}', 7, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:outseam')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'outseam', 'Outseam', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Pant"]}', 8, CURRENT_TIMESTAMP),
  (md5('tailor:measurement:shoulder')::uuid, md5('platform-template:tailor')::uuid, 'measurements', 'measurement-profile', 'shoulder', 'Shoulder', 'MEASUREMENT', false, '"in"', '{"garmentTypes":["Waistcoat","Suit"]}', 9, CURRENT_TIMESTAMP);

UPDATE "Business"
SET "templateId" = md5('platform-template:tailor')::uuid,
    "businessType" = 'TAILOR';

WITH expanded_fields AS (
  SELECT gt."businessId", gt."id" AS garment_template_id, gt."name" AS garment_template_name,
    f.field->>'key' AS field_key,
    COALESCE(NULLIF(f.field->>'label', ''), f.field->>'key') AS field_label,
    COALESCE(NULLIF(f.field->>'unit', ''), 'text') AS field_unit,
    CASE WHEN f.field->>'required' = 'true' THEN true ELSE false END AS field_required,
    f.position::INTEGER AS position
  FROM "GarmentTemplate" gt
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(gt."fields", '[]'::jsonb)) WITH ORDINALITY AS f(field, position)
  WHERE gt."businessId" IS NOT NULL
    AND f.field->>'key' ~ '^[a-z][a-z0-9_]{0,79}$'
)
INSERT INTO "CustomFieldDefinition"
  ("id", "businessId", "module", "screen", "key", "label", "type", "required", "visibility", "sortOrder", "updatedAt")
SELECT md5('migrated-measurement-field:' || fields."businessId"::text || ':' || fields.field_key)::uuid,
  fields."businessId", 'measurements', 'measurement-profile', fields.field_key, max(fields.field_label),
  CASE WHEN bool_and(fields.field_unit = 'text') THEN 'TEXT' ELSE 'MEASUREMENT' END,
  bool_or(fields.field_required),
  jsonb_build_object('garmentTemplates', jsonb_object_agg(
    fields.garment_template_id::text,
    jsonb_build_object('name', fields.garment_template_name, 'unit', fields.field_unit,
      'label', fields.field_label, 'required', fields.field_required)
  )),
  min(fields.position), CURRENT_TIMESTAMP
FROM expanded_fields fields
GROUP BY fields."businessId", fields.field_key;

ALTER TABLE "Business"
  ADD CONSTRAINT "Business_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Business_templateId_idx" ON "Business"("templateId");

INSERT INTO "Permission" ("id", "key", "description")
VALUES (md5('permission:platform:templates:manage')::uuid, 'platform:templates:manage', 'Create and customize business templates')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "PlatformPermissionGrant" ("userId", "permissionId")
SELECT u."id", p."id"
FROM "User" u
CROSS JOIN "Permission" p
WHERE u."platformRole" = 'SUPER_ADMIN' AND p."key" = 'platform:templates:manage'
ON CONFLICT ("userId", "permissionId") DO NOTHING;
