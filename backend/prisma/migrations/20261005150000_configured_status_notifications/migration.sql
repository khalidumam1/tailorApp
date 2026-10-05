BEGIN;

ALTER TYPE "WhatsAppNotificationKind" ADD VALUE IF NOT EXISTS 'STATUS_CHANGED';
ALTER TYPE "WhatsAppNotificationKind" ADD VALUE IF NOT EXISTS 'PAYMENT_DUE';

UPDATE "WorkflowStage"
SET "actions" = "actions" || '["ORDER_READY"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE ("key" ILIKE '%ready%' OR "label" ILIKE '%ready%')
  AND NOT ("actions" @> '["ORDER_READY"]'::jsonb);

COMMIT;
