import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';

const router = express.Router();
const keySchema = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const stageKeySchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const fieldTypes = [
  'TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'DATETIME', 'DROPDOWN',
  'MULTI_SELECT', 'BOOLEAN', 'MEASUREMENT', 'REFERENCE', 'NOTES',
] as const;
const jsonValueSchema = z.unknown().refine((value) => {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}, 'Value must be JSON-compatible');
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
  key: stageKeySchema,
  label: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(10000),
  isInitial: z.boolean().default(false),
  isTerminal: z.boolean().default(false),
  actions: z.array(keySchema).max(30).default([]),
}).strict();
const transitionSchema = z.object({
  from: stageKeySchema,
  to: stageKeySchema,
  allowedRoleKeys: z.array(keySchema).max(50).default([]),
  actions: z.array(keySchema).max(30).default([]),
}).strict();
const structureSchema = z.object({
  version: z.number().int().min(0),
  templateVersion: z.number().int().min(1),
  fields: z.array(fieldSchema).max(300),
  stages: z.array(stageSchema).min(2).max(100),
  transitions: z.array(transitionSchema).max(300),
}).strict();

type StructureInput = z.infer<typeof structureSchema>;

export function validateBusinessStructure(input: StructureInput): void {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(input.fields.map((field) => field.key))
    || !unique(input.stages.map((stage) => stage.key))
    || !unique(input.stages.map((stage) => String(stage.sortOrder)))) {
    throw new HttpError(400, 'Field and workflow keys and stage ordering must be unique', 'DUPLICATE_BUSINESS_CONFIGURATION_KEY');
  }
  if (input.stages.filter((stage) => stage.isInitial).length !== 1
    || !input.stages.some((stage) => stage.isTerminal)) {
    throw new HttpError(400, 'A workflow needs one initial stage and at least one terminal stage', 'INVALID_BUSINESS_WORKFLOW');
  }
  const stageByKey = new Map(input.stages.map((stage) => [stage.key, stage]));
  const transitionKeys = input.transitions.map((transition) => `${transition.from}:${transition.to}`);
  if (!unique(transitionKeys) || input.transitions.some((transition) =>
    transition.from === transition.to
    || !stageByKey.has(transition.from)
    || !stageByKey.has(transition.to)
    || stageByKey.get(transition.from)?.isTerminal)) {
    throw new HttpError(400, 'Transitions must connect known non-terminal stages exactly once', 'INVALID_BUSINESS_WORKFLOW_TRANSITION');
  }
  for (const field of input.fields) {
    if (field.validation !== undefined && field.validation !== null) {
      if (typeof field.validation !== 'object' || Array.isArray(field.validation)) {
        throw new HttpError(400, `Validation rules for "${field.key}" must be an object`, 'INVALID_BUSINESS_FIELD_VALIDATION');
      }
      const validation = field.validation as Record<string, unknown>;
      for (const name of ['minLength', 'maxLength', 'min', 'max']) {
        if (validation[name] !== undefined && (typeof validation[name] !== 'number' || !Number.isFinite(validation[name]))) {
          throw new HttpError(400, `Validation rule "${name}" for "${field.key}" must be a finite number`, 'INVALID_BUSINESS_FIELD_VALIDATION');
        }
        if ((name === 'minLength' || name === 'maxLength')
          && validation[name] !== undefined
          && (!Number.isInteger(validation[name]) || Number(validation[name]) < 0 || Number(validation[name]) > 100000)) {
          throw new HttpError(400, `Validation rule "${name}" for "${field.key}" must be a non-negative integer`, 'INVALID_BUSINESS_FIELD_VALIDATION');
        }
      }
      if (typeof validation.pattern === 'string') {
        if (validation.pattern.length > 300) {
          throw new HttpError(400, `Validation pattern for "${field.key}" is too long`, 'INVALID_BUSINESS_FIELD_VALIDATION');
        }
        try {
          new RegExp(validation.pattern);
        } catch {
          throw new HttpError(400, `Validation pattern for "${field.key}" is invalid`, 'INVALID_BUSINESS_FIELD_VALIDATION');
        }
      } else if (validation.pattern !== undefined) {
        throw new HttpError(400, `Validation pattern for "${field.key}" must be text`, 'INVALID_BUSINESS_FIELD_VALIDATION');
      }
      if (typeof validation.min === 'number' && typeof validation.max === 'number' && validation.min > validation.max) {
        throw new HttpError(400, `Minimum exceeds maximum for "${field.key}"`, 'INVALID_BUSINESS_FIELD_VALIDATION');
      }
      if (typeof validation.minLength === 'number' && typeof validation.maxLength === 'number'
        && validation.minLength > validation.maxLength) {
        throw new HttpError(400, `Minimum length exceeds maximum length for "${field.key}"`, 'INVALID_BUSINESS_FIELD_VALIDATION');
      }
    }
    if (['DROPDOWN', 'MULTI_SELECT'].includes(field.type)) {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new HttpError(400, `Field "${field.key}" needs at least one option`, 'INVALID_BUSINESS_FIELD_OPTIONS');
      }
      const optionKeys = field.options.map((option) => {
        if (typeof option === 'string') return option;
        if (option && typeof option === 'object' && !Array.isArray(option)
          && 'key' in option && typeof option.key === 'string') return option.key;
        return '';
      });
      if (optionKeys.some((key) => !key.trim()) || !unique(optionKeys)) {
        throw new HttpError(400, `Options for "${field.key}" must have unique non-empty keys`, 'INVALID_BUSINESS_FIELD_OPTIONS');
      }
    }
  }
}

function getBusinessId(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function jsonOrDbNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : value as Prisma.InputJsonValue;
}

router.put('/configuration/structure', authenticate, requireBusinessPermission('settings:manage'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const input = structureSchema.parse(req.body);
  validateBusinessStructure(input);

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({
        where: { id: businessId },
        include: {
          configuration: true,
          template: {
            select: {
              id: true,
              version: true,
              enabledModules: true,
              paymentMethods: true,
              dashboardWidgets: true,
              workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
              workflowTransitions: { include: { fromStage: { select: { key: true } }, toStage: { select: { key: true } } } },
            },
          },
          workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
          workflowTransitions: { include: { fromStage: { select: { key: true } }, toStage: { select: { key: true } } } },
          customFields: { where: { active: true }, select: { key: true, module: true } },
        },
      });
      if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
      if (!business.template) throw new HttpError(409, 'Business has no assigned template', 'BUSINESS_TEMPLATE_MISSING');
      if (business.template.version !== input.templateVersion
        || (business.configuration?.version ?? 0) !== input.version) {
        throw new HttpError(409, 'Business configuration or template changed; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
      }

      const effectiveModules = business.configuration?.enabledModules ?? business.template.enabledModules;
      const templateModules = new Set(business.template.enabledModules);
      if (input.fields.some((field) => !templateModules.has(field.module)
        || (!effectiveModules.includes(field.module)
          && !business.customFields.some((existing) => existing.key === field.key && existing.module === field.module)))) {
        throw new HttpError(403, 'Custom fields can only use modules enabled by the assigned template and business', 'BUSINESS_MODULE_DISABLED');
      }
      const canEditWorkflow = templateModules.has('orders') && effectiveModules.includes('orders');
      const currentStages = business.workflowStages.length ? business.workflowStages : business.template.workflowStages;
      const currentTransitions = business.workflowStages.length
        ? business.workflowTransitions : business.template.workflowTransitions;
      const currentStageKeys = new Map(currentStages.map((stage) => [stage.id, stage.key]));
      const normalizeStages = (stages: Array<{
        key: string;
        label: string;
        sortOrder: number;
        isInitial: boolean;
        isTerminal: boolean;
        actions: unknown;
      }>) => stages.map((stage) => ({
        key: stage.key,
        label: stage.label,
        sortOrder: stage.sortOrder,
        isInitial: stage.isInitial,
        isTerminal: stage.isTerminal,
        actions: stage.actions,
      })).sort((a, b) => a.key.localeCompare(b.key));
      const normalizeTransitions = (transitions: Array<{
        from: string;
        to: string;
        allowedRoleKeys: string[];
        actions: unknown;
      }>) => transitions.map((transition) => ({
        from: transition.from,
        to: transition.to,
        allowedRoleKeys: transition.allowedRoleKeys,
        actions: transition.actions,
      })).sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
      const currentTransitionInput = currentTransitions.map((transition) => ({
        from: currentStageKeys.get(transition.fromStageId) ?? transition.fromStage.key,
        to: currentStageKeys.get(transition.toStageId) ?? transition.toStage.key,
        allowedRoleKeys: transition.allowedRoleKeys,
        actions: transition.actions,
      }));
      if (!canEditWorkflow && (
        JSON.stringify(normalizeStages(currentStages)) !== JSON.stringify(normalizeStages(input.stages))
        || JSON.stringify(normalizeTransitions(currentTransitionInput)) !== JSON.stringify(normalizeTransitions(input.transitions))
      )) {
        throw new HttpError(403, 'The orders module is disabled for this business', 'BUSINESS_MODULE_DISABLED');
      }

      const stageKeys = input.stages.map((stage) => stage.key);
      if (canEditWorkflow) {
        const activeOrders = await tx.order.findMany({
          where: { businessId, deletedAt: null },
          select: { workflowStageKey: true },
        });
        const removedCurrentStage = activeOrders.find((order) =>
          order.workflowStageKey !== null && !stageKeys.includes(order.workflowStageKey));
        if (removedCurrentStage) {
          throw new HttpError(409, `Move active orders out of workflow stage "${removedCurrentStage.workflowStageKey}" before removing it`, 'BUSINESS_WORKFLOW_STAGE_IN_USE');
        }
        const outgoingStages = new Set(input.transitions.map((transition) => transition.from));
        for (const stage of input.stages) {
          if (!stage.isTerminal && activeOrders.some((order) => order.workflowStageKey === stage.key)
            && !outgoingStages.has(stage.key)) {
            throw new HttpError(409, `Add an outgoing transition for active order stage "${stage.key}"`, 'BUSINESS_WORKFLOW_STAGE_HAS_ACTIVE_ORDERS');
          }
        }
      }

      const nextVersion = input.version + 1;
      if (business.configuration) {
        const updated = await tx.businessConfiguration.updateMany({
          where: { businessId, version: input.version },
          data: { version: { increment: 1 }, publishedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new HttpError(409, 'Business configuration changed; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
        }
      } else {
        if (input.version !== 0) {
          throw new HttpError(409, 'Business configuration changed; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
        }
        await tx.businessConfiguration.create({
          data: {
            businessId,
            enabledModules: business.template.enabledModules,
            paymentMethods: business.template.paymentMethods,
            dashboardWidgets: business.template.dashboardWidgets,
            version: nextVersion,
            publishedAt: new Date(),
          },
        });
      }

      const fieldKeys = input.fields.map((field) => field.key);
      for (const field of input.fields) {
        const data = {
          module: field.module,
          screen: field.screen,
          label: field.label,
          type: field.type,
          required: field.required,
          defaultValue: jsonOrDbNull(field.defaultValue),
          validation: jsonOrDbNull(field.validation),
          options: jsonOrDbNull(field.options),
          visibility: jsonOrDbNull(field.visibility),
          sortOrder: field.sortOrder,
          active: true,
        };
        await tx.customFieldDefinition.upsert({
          where: { businessId_key: { businessId, key: field.key } },
          create: { businessId, key: field.key, ...data },
          update: data,
        });
      }
      await tx.customFieldDefinition.updateMany({
        where: {
          businessId,
          ...(fieldKeys.length ? { key: { notIn: fieldKeys } } : {}),
        },
        data: { active: false },
      });

      if (canEditWorkflow) {
        const stageIds = new Map<string, string>();
        for (const stage of input.stages) {
          const persisted = await tx.workflowStage.upsert({
            where: { businessId_key: { businessId, key: stage.key } },
            create: {
              businessId,
              key: stage.key,
              label: stage.label,
              sortOrder: stage.sortOrder,
              isInitial: stage.isInitial,
              isTerminal: stage.isTerminal,
              actions: stage.actions,
              active: true,
            },
            update: {
              label: stage.label,
              sortOrder: stage.sortOrder,
              isInitial: stage.isInitial,
              isTerminal: stage.isTerminal,
              actions: stage.actions,
              active: true,
            },
            select: { id: true, key: true },
          });
          stageIds.set(persisted.key, persisted.id);
        }
        await tx.workflowStage.updateMany({
          where: { businessId, ...(stageKeys.length ? { key: { notIn: stageKeys } } : {}) },
          data: { active: false },
        });
        await tx.workflowTransition.deleteMany({ where: { businessId } });
        if (input.transitions.length) {
          await tx.workflowTransition.createMany({
            data: input.transitions.map((transition) => ({
              businessId,
              fromStageId: stageIds.get(transition.from)!,
              toStageId: stageIds.get(transition.to)!,
              allowedRoleKeys: transition.allowedRoleKeys,
              actions: transition.actions,
            })),
          });
        }
      }

      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: req.auth!.userId,
          action: 'business.structure_published',
          entityType: 'business_configuration',
          entityId: businessId,
          metadata: {
            version: nextVersion,
            templateVersion: business.template.version,
            fieldCount: input.fields.length,
            stageCount: input.stages.length,
            transitionCount: input.transitions.length,
            snapshot: JSON.parse(JSON.stringify({
              fields: input.fields,
              stages: input.stages,
              transitions: input.transitions,
            })) as Prisma.InputJsonValue,
          },
          requestId: req.requestId,
        },
      });
      return { version: nextVersion, templateVersion: business.template.version };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ data: saved });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError
      && ['P2002', 'P2034'].includes(error.code)) {
      throw new HttpError(409, 'Business configuration changed concurrently; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
    }
    throw error;
  }
}));

export default router;
