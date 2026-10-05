import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { validateNotificationTemplateBody } from '../domain/notification-templates.js';

const router = express.Router();
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
  notificationTemplates: z.record(z.enum(['ORDER_CREATED', 'PAYMENT_RECEIVED', 'ORDER_READY']), z.object({
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
      fields: [...fieldsByKey.values()].filter((field) => field.active),
      workflow: {
        stages,
        transitions,
      },
      version: business.configuration?.version ?? 0,
      cacheVersion: (business.configuration?.version ?? 0) * 1_000_000 + business.template.version,
      configurationVersion: business.configuration?.version ?? 0,
      templateVersion: business.template.version,
      publishedAt: business.configuration?.publishedAt ?? null,
    },
  });
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
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId: req.auth!.userId,
          action: input.publish ? 'business.configuration_published' : 'business.configuration_updated',
          entityType: 'business_configuration',
          entityId: businessId,
          metadata: { version: configuration.version, changedKeys: Object.keys(input).filter((key) => key !== 'version') },
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
