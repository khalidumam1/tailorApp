import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requirePlatformPermission } from '../middleware/auth.js';

const router = express.Router();
const idSchema = z.string().uuid();
const keySchema = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const paymentMethodSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_-]{0,79}$/);
const dashboardWidgetSchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const fieldTypes = [
  'TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'DATETIME', 'DROPDOWN',
  'MULTI_SELECT', 'BOOLEAN', 'MEASUREMENT', 'REFERENCE', 'NOTES',
] as const;

function isJsonValue(value: unknown, topLevel = true): boolean {
  if (value === null) return !topLevel;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, false));
  if (typeof value === 'object') {
    return Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value).every((item) => isJsonValue(item, false));
  }
  return false;
}

const jsonValueSchema = z.custom<Prisma.InputJsonValue>(isJsonValue);
const fieldSchema = z.object({
  module: keySchema,
  screen: keySchema,
  key: keySchema,
  label: z.string().trim().min(1).max(120),
  type: z.enum(fieldTypes),
  required: z.boolean().default(false),
  defaultValue: jsonValueSchema.optional(),
  validation: jsonValueSchema.optional(),
  options: jsonValueSchema.optional(),
  visibility: jsonValueSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000),
}).strict();
const stageSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(10000),
  isInitial: z.boolean().default(false),
  isTerminal: z.boolean().default(false),
  actions: z.array(keySchema).max(30).default([]),
}).strict();
const transitionSchema = z.object({
  from: keySchema,
  to: keySchema,
  allowedRoleKeys: z.array(keySchema).max(50).default([]),
  actions: z.array(keySchema).max(30).default([]),
}).strict();
const templateSchema = z.object({
  key: keySchema,
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  terminology: z.record(keySchema, z.string().trim().min(1).max(120)),
  enabledModules: z.array(keySchema).min(1).max(40),
  itemTypes: z.array(z.object({
    key: keySchema,
    label: z.string().trim().min(1).max(120),
  }).strict()).min(1).max(100),
  paymentMethods: z.array(paymentMethodSchema).min(1).max(30),
  dashboardWidgets: z.array(dashboardWidgetSchema).max(60),
  fields: z.array(fieldSchema).max(300),
  stages: z.array(stageSchema).min(2).max(100),
  transitions: z.array(transitionSchema).max(300),
}).strict();

export type TemplateInput = z.infer<typeof templateSchema>;

export function validateTemplate(input: TemplateInput): void {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(input.enabledModules) || !unique(input.paymentMethods)
    || !unique(input.dashboardWidgets) || !unique(input.itemTypes.map((item) => item.key))
    || !unique(input.fields.map((field) => field.key))
    || !unique(input.stages.map((stage) => stage.key))) {
    throw new HttpError(400, 'Template keys and module lists must be unique', 'DUPLICATE_TEMPLATE_KEY');
  }
  if (input.stages.filter((stage) => stage.isInitial).length !== 1
    || !input.stages.some((stage) => stage.isTerminal)
    || !unique(input.stages.map((stage) => String(stage.sortOrder)))) {
    throw new HttpError(400, 'A workflow needs one initial stage, a terminal stage, and unique ordering', 'INVALID_TEMPLATE_WORKFLOW');
  }
  const stageByKey = new Map(input.stages.map((stage) => [stage.key, stage]));
  const transitionKeys = input.transitions.map((transition) => `${transition.from}:${transition.to}`);
  if (!unique(transitionKeys) || input.transitions.some((transition) =>
    transition.from === transition.to
    || !stageByKey.has(transition.from)
    || !stageByKey.has(transition.to)
    || stageByKey.get(transition.from)?.isTerminal)) {
    throw new HttpError(400, 'Workflow transitions must connect known non-terminal stages exactly once', 'INVALID_TEMPLATE_TRANSITION');
  }
  const outgoing = new Map(input.stages.map((stage) => [stage.key, [] as string[]]));
  for (const transition of input.transitions) outgoing.get(transition.from)?.push(transition.to);
  const initial = input.stages.find((stage) => stage.isInitial)!;
  if (input.stages.some((stage) => !stage.isTerminal && !outgoing.get(stage.key)?.length)) {
    throw new HttpError(400, 'Every non-terminal workflow stage needs an outgoing transition', 'INVALID_TEMPLATE_WORKFLOW_GRAPH');
  }
  const reachable = new Set<string>([initial.key]);
  const pending = [initial.key];
  while (pending.length) {
    for (const next of outgoing.get(pending.pop()!) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        pending.push(next);
      }
    }
  }
  if (input.stages.some((stage) => !reachable.has(stage.key))
    || !input.stages.some((stage) => stage.isTerminal && reachable.has(stage.key))) {
    throw new HttpError(400, 'Every workflow stage must be reachable from the initial stage and lead to a terminal stage', 'INVALID_TEMPLATE_WORKFLOW_GRAPH');
  }
  if (input.fields.some((field) => !input.enabledModules.includes(field.module))) {
    throw new HttpError(400, 'Every custom field must belong to an enabled module', 'INVALID_TEMPLATE_FIELD_MODULE');
  }
  const itemTypeKeys = new Set(input.itemTypes.map((itemType) => itemType.key));
  for (const field of input.fields) {
    if (field.visibility === undefined || field.visibility === null) continue;
    if (typeof field.visibility !== 'object' || Array.isArray(field.visibility)) {
      throw new HttpError(400, `Visibility rules for "${field.key}" must be an object`, 'INVALID_TEMPLATE_FIELD_VISIBILITY');
    }
    const visibility = field.visibility as Record<string, unknown>;
    const visibleItemTypes = visibility.itemTypes ?? visibility.garmentTypes;
    if (visibleItemTypes !== undefined
      && (!Array.isArray(visibleItemTypes)
        || !visibleItemTypes.every((key) => typeof key === 'string' && itemTypeKeys.has(key)))) {
      throw new HttpError(400, `Visibility rules for "${field.key}" must reference configured item types`, 'INVALID_TEMPLATE_FIELD_VISIBILITY');
    }
  }
}

export function buildTemplateRevisionSnapshot(
  input: TemplateInput,
  version: number,
  isSystem: boolean,
): Prisma.InputJsonValue {
  return {
    version,
    key: input.key,
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    terminology: input.terminology,
    enabledModules: input.enabledModules,
    itemTypes: input.itemTypes,
    paymentMethods: input.paymentMethods,
    dashboardWidgets: input.dashboardWidgets,
    isSystem,
    active: true,
    fields: input.fields.map((field) => ({
      module: field.module,
      screen: field.screen,
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      sortOrder: field.sortOrder,
      ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
      ...(field.validation !== undefined ? { validation: field.validation } : {}),
      ...(field.options !== undefined ? { options: field.options } : {}),
      ...(field.visibility !== undefined ? { visibility: field.visibility } : {}),
    })),
    stages: input.stages,
    transitions: input.transitions,
  };
}

async function persistTemplate(
  input: TemplateInput,
  actorId: string,
  requestId: string,
  templateId?: string,
) {
  validateTemplate(input);
  return prisma.$transaction(async (tx) => {
    const existing = templateId
      ? await tx.businessTemplate.findUnique({ where: { id: templateId }, select: { id: true, isSystem: true } })
      : null;
    if (templateId && !existing) throw new HttpError(404, 'Business template not found', 'TEMPLATE_NOT_FOUND');

    const scalarData = {
      key: input.key,
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      terminology: input.terminology,
      enabledModules: input.enabledModules,
      itemTypes: input.itemTypes,
      paymentMethods: input.paymentMethods,
      dashboardWidgets: input.dashboardWidgets,
      active: true,
      ...(existing ? {} : { isSystem: false }),
    };
    const template = existing
      ? await tx.businessTemplate.update({
        where: { id: existing.id },
        data: { ...scalarData, version: { increment: 1 } },
      })
      : await tx.businessTemplate.create({ data: scalarData });
    await tx.businessTemplateRevision.create({
      data: {
        templateId: template.id,
        version: template.version,
        snapshot: buildTemplateRevisionSnapshot(input, template.version, template.isSystem),
        actorId,
        requestId,
      },
    });

    const fieldKeys = input.fields.map((field) => field.key);
    for (const field of input.fields) {
      const data = {
        module: field.module,
        screen: field.screen,
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        sortOrder: field.sortOrder,
        active: true,
        defaultValue: field.defaultValue ?? Prisma.DbNull,
        validation: field.validation ?? Prisma.DbNull,
        options: field.options ?? Prisma.DbNull,
        visibility: field.visibility ?? Prisma.DbNull,
      };
      await tx.customFieldDefinition.upsert({
        where: { templateId_key: { templateId: template.id, key: field.key } },
        create: { templateId: template.id, ...data },
        update: data,
      });
    }
    await tx.customFieldDefinition.updateMany({
      where: {
        templateId: template.id,
        ...(fieldKeys.length ? { key: { notIn: fieldKeys } } : {}),
      },
      data: { active: false },
    });

    const stageKeys = input.stages.map((stage) => stage.key);
    const existingStages = await tx.workflowStage.findMany({
      where: { templateId: template.id },
      select: { id: true, key: true },
    });
    const stageIds = new Map<string, string>();
    for (const stage of input.stages) {
      const data = {
        label: stage.label,
        sortOrder: stage.sortOrder,
        isInitial: stage.isInitial,
        isTerminal: stage.isTerminal,
        actions: stage.actions,
        active: true,
      };
      const persisted = await tx.workflowStage.upsert({
        where: { templateId_key: { templateId: template.id, key: stage.key } },
        create: { templateId: template.id, key: stage.key, ...data },
        update: data,
        select: { id: true, key: true },
      });
      stageIds.set(persisted.key, persisted.id);
    }
    const removedStages = existingStages.filter((stage) => !stageKeys.includes(stage.key));
    const removedStageIds = removedStages.map((stage) => stage.id);
    if (removedStageIds.length) {
      const inUse = await tx.order.findFirst({
        where: { workflowStageId: { in: removedStageIds }, deletedAt: null },
        select: { id: true, orderNumber: true },
      });
      if (inUse) {
        throw new HttpError(
          409,
          `Move active order ${inUse.orderNumber} before removing its workflow stage`,
          'TEMPLATE_STAGE_IN_USE',
        );
      }
    }
    const stagesWithLiveOrders = await tx.order.findMany({
      where: {
        workflowStageId: { in: existingStages.map((stage) => stage.id) },
        deletedAt: null,
      },
      select: { workflowStageId: true },
      distinct: ['workflowStageId'],
    });
    const nextStagesWithOutgoing = new Set(input.transitions.map((transition) => transition.from));
    for (const orderStage of stagesWithLiveOrders) {
      const currentStage = existingStages.find((stage) => stage.id === orderStage.workflowStageId);
      if (currentStage && stageKeys.includes(currentStage.key)
        && !input.stages.find((stage) => stage.key === currentStage.key)?.isTerminal
        && !nextStagesWithOutgoing.has(currentStage.key)) {
        throw new HttpError(
          409,
          `Add an outgoing transition for active order stage "${currentStage.key}" before publishing`,
          'TEMPLATE_STAGE_HAS_ACTIVE_ORDERS',
        );
      }
    }
    await tx.workflowStage.updateMany({
      where: {
        templateId: template.id,
        ...(stageKeys.length ? { key: { notIn: stageKeys } } : {}),
      },
      data: { active: false },
    });
    await tx.workflowTransition.deleteMany({ where: { templateId: template.id } });
    if (input.transitions.length) {
      await tx.workflowTransition.createMany({
        data: input.transitions.map((transition) => ({
          templateId: template.id,
          fromStageId: stageIds.get(transition.from)!,
          toStageId: stageIds.get(transition.to)!,
          allowedRoleKeys: transition.allowedRoleKeys,
          actions: transition.actions,
        })),
      });
    }

    await tx.auditEvent.create({
      data: {
        actorId,
        action: existing ? 'platform.template_updated' : 'platform.template_created',
        entityType: 'business_template',
        entityId: template.id,
        metadata: {
          key: template.key,
          version: template.version,
          fieldCount: input.fields.length,
          stageCount: input.stages.length,
        },
        requestId,
      },
    });
    return tx.businessTemplate.findUniqueOrThrow({
      where: { id: template.id },
      include: {
        fields: { where: { active: true }, orderBy: [{ module: 'asc' }, { screen: 'asc' }, { sortOrder: 'asc' }] },
        workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        workflowTransitions: true,
      },
    });
  });
}

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const permissions = req.auth?.scope === 'platform' ? req.auth.platformPermissions : [];
  if (!permissions.includes('platform:businesses:read') && !permissions.includes('platform:templates:manage')) {
    throw new HttpError(403, 'Platform permission is not granted', 'PLATFORM_PERMISSION_DENIED');
  }
  const items = await prisma.businessTemplate.findMany({
    where: { active: true },
    include: {
      fields: { where: { active: true }, orderBy: [{ module: 'asc' }, { screen: 'asc' }, { sortOrder: 'asc' }] },
      workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      workflowTransitions: true,
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
  res.json({ data: { items } });
}));

router.get('/:templateId/revisions', requirePlatformPermission('platform:templates:manage'), asyncHandler(async (req, res) => {
  const templateId = idSchema.parse(req.params.templateId);
  const template = await prisma.businessTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  });
  if (!template) throw new HttpError(404, 'Business template not found', 'TEMPLATE_NOT_FOUND');
  const items = await prisma.businessTemplateRevision.findMany({
    where: { templateId },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ data: { items } });
}));

router.post('/', requirePlatformPermission('platform:templates:manage'), asyncHandler(async (req, res) => {
  const input = templateSchema.parse(req.body);
  if (req.auth?.scope !== 'platform') throw new HttpError(403, 'Platform access is required', 'PLATFORM_ACCESS_DENIED');
  try {
    const template = await persistTemplate(input, req.auth.userId, req.requestId);
    res.status(201).json({ data: template });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A template with this key already exists', 'DUPLICATE_TEMPLATE');
    }
    throw error;
  }
}));

router.put('/:templateId', requirePlatformPermission('platform:templates:manage'), asyncHandler(async (req, res) => {
  const templateId = idSchema.parse(req.params.templateId);
  const input = templateSchema.parse(req.body);
  if (req.auth?.scope !== 'platform') throw new HttpError(403, 'Platform access is required', 'PLATFORM_ACCESS_DENIED');
  try {
    const template = await persistTemplate(input, req.auth.userId, req.requestId, templateId);
    res.json({ data: template });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A template with this key already exists', 'DUPLICATE_TEMPLATE');
    }
    throw error;
  }
}));

export default router;
