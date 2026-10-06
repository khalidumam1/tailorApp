INSERT INTO "WorkflowTransition"
  ("id", "templateId", "fromStageId", "toStageId")
SELECT md5('tailor-cancel:' || source."key")::uuid,
       source."templateId",
       source."id",
       cancelled."id"
FROM "WorkflowStage" source
JOIN "WorkflowStage" cancelled
  ON cancelled."templateId" = source."templateId"
 AND cancelled."key" = 'CANCELLED'
JOIN "BusinessTemplate" template
  ON template."id" = source."templateId"
 AND template."key" = 'tailor'
WHERE source."isTerminal" = false
  AND source."key" <> 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1
    FROM "WorkflowTransition" transition
    WHERE transition."templateId" = source."templateId"
      AND transition."fromStageId" = source."id"
      AND transition."toStageId" = cancelled."id"
  );
