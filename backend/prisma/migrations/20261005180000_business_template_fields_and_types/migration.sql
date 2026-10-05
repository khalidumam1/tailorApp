BEGIN;

UPDATE "BusinessTemplate"
SET "itemTypes" = "itemTypes" || '[
  {"key":"sofa","label":"Sofa"},
  {"key":"bed","label":"Bed"},
  {"key":"table","label":"Table"},
  {"key":"chair","label":"Chair"},
  {"key":"wardrobe","label":"Wardrobe"}
]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1
WHERE "key" = 'furniture';

UPDATE "BusinessTemplate"
SET "itemTypes" = "itemTypes" || '[
  {"key":"cabinet","label":"Cabinet"},
  {"key":"door","label":"Door"},
  {"key":"installation","label":"Installation Project"}
]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1
WHERE "key" = 'carpenter';

UPDATE "BusinessTemplate"
SET "itemTypes" = "itemTypes" || '[
  {"key":"repair_job","label":"Repair Job"},
  {"key":"service","label":"Service"},
  {"key":"part","label":"Part"}
]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1
WHERE "key" = 'auto-workshop';

UPDATE "BusinessTemplate"
SET "itemTypes" = "itemTypes" || '[
  {"key":"business_card","label":"Business Card"},
  {"key":"banner","label":"Banner"},
  {"key":"flyer","label":"Flyer"}
]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1
WHERE "key" = 'printing';

UPDATE "CustomFieldDefinition"
SET "options" = '["Oak","Pine","Teak","Plywood","Metal","Upholstery"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "templateId" = md5('platform-template:furniture')::uuid
  AND "key" = 'material';

INSERT INTO "CustomFieldDefinition"
  ("id","templateId","module","screen","key","label","type","required","options","sortOrder","updatedAt")
VALUES
  (md5('furniture:color')::uuid, md5('platform-template:furniture')::uuid, 'orders', 'order-item', 'color', 'Color', 'TEXT', false, NULL, 2, CURRENT_TIMESTAMP),
  (md5('furniture:design')::uuid, md5('platform-template:furniture')::uuid, 'orders', 'order-item', 'design', 'Design', 'LONG_TEXT', false, NULL, 3, CURRENT_TIMESTAMP),
  (md5('furniture:finish')::uuid, md5('platform-template:furniture')::uuid, 'orders', 'order-item', 'finish', 'Finish', 'DROPDOWN', false, '["Matte","Gloss","Natural"]'::jsonb, 4, CURRENT_TIMESTAMP),
  (md5('furniture:catalog_dimensions')::uuid, md5('platform-template:furniture')::uuid, 'catalog', 'catalog-item', 'catalog_dimensions', 'Dimensions (cm)', 'MEASUREMENT', true, NULL, 0, CURRENT_TIMESTAMP),
  (md5('furniture:catalog_material')::uuid, md5('platform-template:furniture')::uuid, 'catalog', 'catalog-item', 'catalog_material', 'Material', 'DROPDOWN', false, '["Oak","Pine","Teak","Plywood","Metal","Upholstery"]'::jsonb, 1, CURRENT_TIMESTAMP),
  (md5('furniture:catalog_color')::uuid, md5('platform-template:furniture')::uuid, 'catalog', 'catalog-item', 'catalog_color', 'Color', 'TEXT', false, NULL, 2, CURRENT_TIMESTAMP),
  (md5('furniture:catalog_design')::uuid, md5('platform-template:furniture')::uuid, 'catalog', 'catalog-item', 'catalog_design', 'Design', 'LONG_TEXT', false, NULL, 3, CURRENT_TIMESTAMP),
  (md5('carpenter:wood_material')::uuid, md5('platform-template:carpenter')::uuid, 'orders', 'order-item', 'wood_material', 'Wood / Material', 'DROPDOWN', false, '["Oak","Sheesham","Pine","Deodar","Plywood"]'::jsonb, 1, CURRENT_TIMESTAMP),
  (md5('carpenter:design')::uuid, md5('platform-template:carpenter')::uuid, 'orders', 'order-item', 'design', 'Design', 'LONG_TEXT', false, NULL, 2, CURRENT_TIMESTAMP),
  (md5('carpenter:installation_notes')::uuid, md5('platform-template:carpenter')::uuid, 'orders', 'order', 'installation_notes', 'Installation Notes', 'LONG_TEXT', false, NULL, 0, CURRENT_TIMESTAMP),
  (md5('carpenter:catalog_dimensions')::uuid, md5('platform-template:carpenter')::uuid, 'catalog', 'catalog-item', 'catalog_dimensions', 'Dimensions', 'MEASUREMENT', true, NULL, 0, CURRENT_TIMESTAMP),
  (md5('carpenter:catalog_material')::uuid, md5('platform-template:carpenter')::uuid, 'catalog', 'catalog-item', 'catalog_material', 'Wood / Material', 'DROPDOWN', false, '["Oak","Sheesham","Pine","Deodar","Plywood"]'::jsonb, 1, CURRENT_TIMESTAMP),
  (md5('carpenter:catalog_design')::uuid, md5('platform-template:carpenter')::uuid, 'catalog', 'catalog-item', 'catalog_design', 'Design', 'LONG_TEXT', false, NULL, 2, CURRENT_TIMESTAMP),
  (md5('auto:registration')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'registration', 'Registration', 'TEXT', true, NULL, 2, CURRENT_TIMESTAMP),
  (md5('auto:service_type')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'service_type', 'Service / Repair', 'DROPDOWN', true, '["Repair","Maintenance","Inspection","Part replacement"]'::jsonb, 3, CURRENT_TIMESTAMP),
  (md5('auto:parts')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'parts', 'Parts', 'LONG_TEXT', false, NULL, 4, CURRENT_TIMESTAMP),
  (md5('auto:labour')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'labour', 'Labour', 'CURRENCY', false, NULL, 5, CURRENT_TIMESTAMP),
  (md5('auto:estimate')::uuid, md5('platform-template:auto-workshop')::uuid, 'orders', 'job', 'estimate', 'Estimate', 'CURRENCY', false, NULL, 6, CURRENT_TIMESTAMP),
  (md5('auto:catalog_registration')::uuid, md5('platform-template:auto-workshop')::uuid, 'catalog', 'catalog-item', 'catalog_registration', 'Registration', 'TEXT', false, NULL, 0, CURRENT_TIMESTAMP),
  (md5('auto:catalog_parts')::uuid, md5('platform-template:auto-workshop')::uuid, 'catalog', 'catalog-item', 'catalog_parts', 'Parts', 'LONG_TEXT', false, NULL, 1, CURRENT_TIMESTAMP),
  (md5('auto:catalog_labour')::uuid, md5('platform-template:auto-workshop')::uuid, 'catalog', 'catalog-item', 'catalog_labour', 'Labour', 'CURRENCY', false, NULL, 2, CURRENT_TIMESTAMP),
  (md5('auto:catalog_estimate')::uuid, md5('platform-template:auto-workshop')::uuid, 'catalog', 'catalog-item', 'catalog_estimate', 'Estimate', 'CURRENCY', false, NULL, 3, CURRENT_TIMESTAMP),
  (md5('printing:size')::uuid, md5('platform-template:printing')::uuid, 'orders', 'order-item', 'size', 'Size', 'DROPDOWN', true, '["A4","A5","A3","Custom"]'::jsonb, 1, CURRENT_TIMESTAMP),
  (md5('printing:material')::uuid, md5('platform-template:printing')::uuid, 'orders', 'order-item', 'material', 'Material', 'DROPDOWN', true, '["Glossy paper","Matte paper","Card stock","Vinyl","Flex"]'::jsonb, 2, CURRENT_TIMESTAMP),
  (md5('printing:quantity')::uuid, md5('platform-template:printing')::uuid, 'orders', 'order-item', 'quantity', 'Quantity', 'NUMBER', true, NULL, 3, CURRENT_TIMESTAMP),
  (md5('printing:design')::uuid, md5('platform-template:printing')::uuid, 'orders', 'order-item', 'design', 'Design Notes', 'LONG_TEXT', false, NULL, 4, CURRENT_TIMESTAMP),
  (md5('printing:finishing')::uuid, md5('platform-template:printing')::uuid, 'orders', 'order-item', 'finishing', 'Finishing', 'DROPDOWN', false, '["None","Lamination","Binding","Folding","Cutting"]'::jsonb, 5, CURRENT_TIMESTAMP),
  (md5('printing:catalog_size')::uuid, md5('platform-template:printing')::uuid, 'catalog', 'catalog-item', 'catalog_size', 'Size', 'DROPDOWN', true, '["A4","A5","A3","Custom"]'::jsonb, 0, CURRENT_TIMESTAMP),
  (md5('printing:catalog_material')::uuid, md5('platform-template:printing')::uuid, 'catalog', 'catalog-item', 'catalog_material', 'Material', 'DROPDOWN', false, '["Glossy paper","Matte paper","Card stock","Vinyl","Flex"]'::jsonb, 1, CURRENT_TIMESTAMP),
  (md5('printing:catalog_quantity')::uuid, md5('platform-template:printing')::uuid, 'catalog', 'catalog-item', 'catalog_quantity', 'Quantity', 'NUMBER', false, NULL, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("templateId","key") DO UPDATE
SET "module" = EXCLUDED."module",
    "screen" = EXCLUDED."screen",
    "label" = EXCLUDED."label",
    "type" = EXCLUDED."type",
    "required" = EXCLUDED."required",
    "options" = EXCLUDED."options",
    "sortOrder" = EXCLUDED."sortOrder",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
