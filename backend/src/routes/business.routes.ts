import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { validateNotificationTemplateBody } from '../domain/notification-templates.js';

const router = express.Router();
const historyQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const keySchema = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const configurationSchema = z.object({
  version: z.number().int().min(0),
  business: z.object({
    name: z.string().trim().min(1).max(160).optional(),
    logoUrl: z.string().url().max(2048).refine((value) => value.startsWith('https://')).nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    timezone: z.string().min(1).max(100).optional(),
  }).strict().optional(),
  terminologyOverrides: z.record(keySchema, z.string().trim().min(1).max(120)).optional(),
  enabledModules: z.array(keySchema).max(40).optional(),
  paymentMethods: z.array(keySchema).min(1).max(30).optional(),
  notificationTemplates: z.record(z.enum(['ORDER_CREATED', 'PAYMENT_RECEIVED', 'ORDER_READY', 'STATUS_CHANGED', 'PAYMENT_DUE', 'SUBSCRIPTION_EXPIRING']), z.object({
    enabled: z.boolean(),
    body: z.string().trim().min(1).max(2000),
    providerTemplateName: z.string().regex(/^[a-z0-9_]{1,128}$/).optional(),
    language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/).optional(),
  }).strict().superRefine((template, context) => {
    try {
      validateNotificationTemplateBody(template.body);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Notification template body is invalid',
        path: ['body'],
      });
    }
  })).optional(),
  contactPhone: z.string().trim().min(6).max(32).regex(/^\+?[0-9][0-9\s().-]*$/).nullable().optional(),
  dashboardWidgets: z.array(keySchema).max(60).optional(),
  publish: z.boolean().default(true),
}).strict().refine((input) =>
  Object.keys(input).some((key) => key !== 'version' && key !== 'publish'),
  'Provide at least one configuration value to update',
);

function getBusinessId(req: express.Request): string {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, Prisma.JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = item;
  }
  return result;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new HttpError(400, 'Timezone must be a valid IANA timezone', 'INVALID_TIMEZONE');
  }
}

router.use(authenticate);

router.get('/configuration', asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      template: {
        include: {
          fields: { where: { active: true }, orderBy: [{ module: 'asc' }, { screen: 'asc' }, { sortOrder: 'asc' }] },
          workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
          workflowTransitions: true,
        },
      },
      configuration: true,
      customFields: {
        where: { active: true },
        orderBy: [{ module: 'asc' }, { screen: 'asc' }, { sortOrder: 'asc' }],
      },
      workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      workflowTransitions: true,
    },
  });
  if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  if (!business.template) throw new HttpError(409, 'Business has no assigned template', 'BUSINESS_TEMPLATE_MISSING');

  const terminology = {
    ...jsonObject(business.template.terminology),
    ...jsonObject(business.configuration?.terminologyOverrides),
  };
  const fieldsByKey = new Map(business.template.fields.map((field) => [field.key, field]));
  for (const field of business.customFields) fieldsByKey.set(field.key, field);
  const stages = business.workflowStages.length ? business.workflowStages : business.template.workflowStages;
  const transitions = business.workflowStages.length
    ? business.workflowTransitions : business.template.workflowTransitions;
  res.json({
    data: {
      business: {
        id: business.id,
        name: business.name,
        logoUrl: business.logoUrl,
        type: business.businessType,
        currency: business.currency,
        timezone: business.timezone,
      },
      template: {
        id: business.template.id,
        key: business.template.key,
        name: business.template.name,
        category: business.template.category,
        itemTypes: business.template.itemTypes,
      },
      availableModules: business.template.enabledModules,
      availablePaymentMethods: business.template.paymentMethods,
      availableDashboardWidgets: business.template.dashboardWidgets,
      terminology,
      enabledModules: business.configuration?.enabledModules ?? business.template.enabledModules,
      paymentMethods: business.configuration?.paymentMethods ?? business.template.paymentMethods,
      dashboardWidgets: business.configuration?.dashboardWidgets ?? business.template.dashboardWidgets,
      notificationTemplates: business.configuration?.notificationTemplates ?? {},
      contactPhone: business.configuration?.contactPhone ?? null,
      fields: [...fieldsByKey.values()].filter((field) => field.active),
      tenantFields: business.customFields,
      workflow: {
        stages,
        transitions,
      },
      workflowIsTenantScoped: business.workflowStages.length > 0,
      version: business.configuration?.version ?? 0,
      cacheVersion: (business.configuration?.version ?? 0) * 1_000_000 + business.template.version,
      configurationVersion: business.configuration?.version ?? 0,
      templateVersion: business.template.version,
      publishedAt: business.configuration?.publishedAt ?? null,
    },
  });
}));

router.get('/configuration/history', requireBusinessPermission('settings:manage'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const query = historyQuerySchema.parse(req.query);
  if (query.cursor) {
    const cursor = await prisma.auditEvent.findFirst({
      where: { id: query.cursor, businessId, entityType: 'business_configuration' },
      select: { id: true },
    });
    if (!cursor) throw new HttpError(400, 'Configuration history cursor is invalid', 'INVALID_CURSOR');
  }
  const events = await prisma.auditEvent.findMany({
    where: {
      businessId,
      entityType: 'business_configuration',
      action: { in: ['business.configuration_published', 'business.configuration_updated', 'business.structure_published'] },
    },
    select: { id: true, actor: { select: { name: true } }, metadata: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = events.length > query.limit;
  const items = (hasMore ? events.slice(0, query.limit) : events).map((event) => {
    const metadata = jsonObject(event.metadata);
    return {
      id: event.id,
      actorName: event.actor?.name ?? 'Former user',
      version: typeof metadata.version === 'number' ? metadata.version : null,
      templateVersion: typeof metadata.templateVersion === 'number' ? metadata.templateVersion : null,
      snapshot: metadata.snapshot ?? null,
      createdAt: event.createdAt,
    };
  });
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

router.put('/configuration', requireBusinessPermission('settings:manage'), asyncHandler(async (req, res) => {
  const businessId = getBusinessId(req);
  const input = configurationSchema.parse(req.body);
  if (input.business?.timezone) validateTimezone(input.business.timezone);

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({
        where: { id: businessId },
        include: { template: true, configuration: true },
      });
      if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
      if (!business.template) throw new HttpError(409, 'Business has no assigned template', 'BUSINESS_TEMPLATE_MISSING');
      if ((business.configuration?.version ?? 0) !== input.version) {
        throw new HttpError(409, 'Configuration changed since it was loaded; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
      }
      const templateModules = new Set(business.template.enabledModules);
      if (input.enabledModules?.some((module) => !templateModules.has(module))) {
        throw new HttpError(400, 'Only modules provided by this business template can be enabled', 'INVALID_BUSINESS_MODULE');
      }

      const terminologyOverrides = {
        ...jsonObject(business.configuration?.terminologyOverrides),
        ...(input.terminologyOverrides ?? {}),
      };
      const configurationData = {
        terminologyOverrides,
        enabledModules: input.enabledModules ?? business.configuration?.enabledModules ?? business.template.enabledModules,
        paymentMethods: input.paymentMethods ?? business.configuration?.paymentMethods ?? business.template.paymentMethods,
        notificationTemplates: input.notificationTemplates ?? business.configuration?.notificationTemplates ?? {},
        contactPhone: input.contactPhone !== undefined ? input.contactPhone : business.configuration?.contactPhone ?? null,
        dashboardWidgets: input.dashboardWidgets ?? business.configuration?.dashboardWidgets ?? business.template.dashboardWidgets,
        publishedAt: input.publish ? new Date() : business.configuration?.publishedAt ?? null,
        version: { increment: 1 },
      };
      let configuration;
      if (business.configuration) {
        const result = await tx.businessConfiguration.updateMany({
          where: { businessId, version: input.version },
          data: configurationData,
        });
        if (result.count !== 1) {
          throw new HttpError(409, 'Configuration changed since it was loaded; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
        }
        configuration = await tx.businessConfiguration.findUniqueOrThrow({ where: { businessId } });
      } else {
        if (input.version !== 0) {
          throw new HttpError(409, 'Configuration changed since it was loaded; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
        }
        configuration = await tx.businessConfiguration.create({
          data: { businessId, ...configurationData, version: 1 },
        });
      }

      const businessData: Prisma.BusinessUpdateInput = {
        ...(input.business?.name !== undefined ? { name: input.business.name } : {}),
        ...(input.business?.logoUrl !== undefined ? { logoUrl: input.business.logoUrl } : {}),
        ...(input.business?.currency !== undefined ? { currency: input.business.currency } : {}),
        ...(input.business?.timezone !== undefined ? { timezone: input.business.timezone } : {}),
      };
      if (Object.keys(businessData).length > 0) {
        await tx.business.update({ where: { id: businessId }, data: businessData });
      }
      const currentBusiness = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
        include: {
          template: {
            include: {
              fields: { where: { active: true }, orderBy: [{ module: 'asc' }, { screen: 'asc' }, { sortOrder: 'asc' }] },
              workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
              workflowTransitions: { include: { fromStage: { select: { key: true } }, toStage: { select: { key: true } } } },
            },
          },
          configuration: true,
          customFields: { where: { active: true }, orderBy: [{ module: 'asc' }, { screen: 'asc' }, { sortOrder: 'asc' }] },
          workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
          workflowTransitions: { include: { fromStage: { select: { key: true } }, toStage: { select: { key: true } } } },
        },
      });
      const fields = new Map(currentBusiness.template?.fields.map((field) => [field.key, field]) ?? []);
      for (const field of currentBusiness.customFields) fields.set(field.key, field);
      const workflowStages = currentBusiness.workflowStages.length
        ? currentBusiness.workflowStages : currentBusiness.template?.workflowStages ?? [];
      const workflowTransitions = currentBusiness.workflowStages.length
        ? currentBusiness.workflowTransitions : currentBusiness.template?.workflowTransitions ?? [];
      const snapshot = jsonSnapshot({
        business: {
          name: currentBusiness.name,
          logoUrl: currentBusiness.logoUrl,
          currency: currentBusiness.currency,
          timezone: currentBusiness.timezone,
        },
        configuration: {
          version: configuration.version,
          terminologyOverrides: configuration.terminologyOverrides,
          enabledModules: configuration.enabledModules,
          paymentMethods: configuration.paymentMethods,
          notificationTemplates: configuration.notificationTemplates,
          dashboardWidgets: configuration.dashboardWidgets,
          publishedAt: configuration.publishedAt,
        },
        templateVersion: currentBusiness.template?.version ?? 0,
        fields: [...fields.values()],
        workflow: {
          stages: workflowStages,
          transitions: workflowTransitions.map((transition) => ({
            from: transition.fromStage.key,
            to: transition.toStage.key,
            allowedRoleKeys: transition.allowedRoleKeys,
            actions: transition.actions,
          })),
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: req.auth!.userId,
          action: input.publish ? 'business.configuration_published' : 'business.configuration_updated',
          entityType: 'business_configuration',
          entityId: businessId,
          metadata: {
            version: configuration.version,
            templateVersion: currentBusiness.template?.version ?? 0,
            changedKeys: Object.keys(input).filter((key) => key !== 'version'),
            snapshot,
          },
          requestId: req.requestId,
        },
      });
      return configuration;
    });
    res.json({ data: saved });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Configuration changed concurrently; reload before saving', 'CONFIGURATION_VERSION_CONFLICT');
    }
    throw error;
  }
}));

export default router;
