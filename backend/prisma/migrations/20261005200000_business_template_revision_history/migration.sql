CREATE TABLE "BusinessTemplateRevision" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actorId" UUID,
  "requestId" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessTemplateRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessTemplateRevision_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BusinessTemplateRevision_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BusinessTemplateRevision_templateId_version_key"
  ON "BusinessTemplateRevision"("templateId", "version");
CREATE INDEX "BusinessTemplateRevision_templateId_createdAt_idx"
  ON "BusinessTemplateRevision"("templateId", "createdAt");

INSERT INTO "BusinessTemplateRevision"
  ("id", "templateId", "version", "snapshot", "actorId", "requestId", "createdAt")
SELECT
  gen_random_uuid(),
  template."id",
  template."version",
  jsonb_build_object(
    'version', template."version",
    'key', template."key",
    'name', template."name",
    'category', template."category",
    'description', template."description",
    'terminology', template."terminology",
    'enabledModules', to_jsonb(template."enabledModules"),
    'itemTypes', template."itemTypes",
    'paymentMethods', to_jsonb(template."paymentMethods"),
    'dashboardWidgets', to_jsonb(template."dashboardWidgets"),
    'isSystem', template."isSystem",
    'active', template."active",
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'module', field."module",
        'screen', field."screen",
        'key', field."key",
        'label', field."label",
        'type', field."type",
        'required', field."required",
        'sortOrder', field."sortOrder",
        'defaultValue', field."defaultValue",
        'validation', field."validation",
        'options', field."options",
        'visibility', field."visibility"
      ) ORDER BY field."module", field."screen", field."sortOrder", field."key")
      FROM "CustomFieldDefinition" AS field
      WHERE field."templateId" = template."id" AND field."active" = true
    ), '[]'::jsonb),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', stage."key",
        'label', stage."label",
        'sortOrder', stage."sortOrder",
        'isInitial', stage."isInitial",
        'isTerminal', stage."isTerminal",
        'actions', stage."actions"
      ) ORDER BY stage."sortOrder", stage."key")
      FROM "WorkflowStage" AS stage
      WHERE stage."templateId" = template."id" AND stage."active" = true
    ), '[]'::jsonb),
    'transitions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'from', from_stage."key",
        'to', to_stage."key",
        'allowedRoleKeys', to_jsonb(transition."allowedRoleKeys"),
        'actions', transition."actions"
      ) ORDER BY from_stage."key", to_stage."key")
      FROM "WorkflowTransition" AS transition
      JOIN "WorkflowStage" AS from_stage ON from_stage."id" = transition."fromStageId"
      JOIN "WorkflowStage" AS to_stage ON to_stage."id" = transition."toStageId"
      WHERE transition."templateId" = template."id"
    ), '[]'::jsonb)
  ),
  NULL,
  'migration:baseline',
  template."updatedAt"
FROM "BusinessTemplate" AS template;

CREATE FUNCTION prevent_business_template_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Business template revisions are append-only';
END;
$$;

CREATE TRIGGER "BusinessTemplateRevision_append_only"
  BEFORE UPDATE OR DELETE ON "BusinessTemplateRevision"
  FOR EACH ROW EXECUTE FUNCTION prevent_business_template_revision_mutation();
