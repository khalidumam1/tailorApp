import { Prisma } from '@prisma/client';
import express from 'express';
import {
  createGarmentTemplateSchema,
  createMeasurementRevisionSchema,
  garmentTemplateFieldSchema,
} from '@tailor/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { queueMeasurementAppended } from '../whatsapp.js';

const router = express.Router();
const idSchema = z.string().uuid();

function getContext(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function uniqueTemplateKeys(fields: Array<{ key: string }>): boolean {
  return new Set(fields.map((field) => field.key)).size === fields.length;
}

router.use(authenticate);

router.get('/templates', requireBusinessPermission('measurements:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const templates = await prisma.garmentTemplate.findMany({
    where: { active: true, OR: [{ businessId }, { businessId: null }] },
    orderBy: [{ businessId: 'asc' }, { name: 'asc' }],
  });
  res.json({ data: { items: templates } });
}));

router.post('/templates', requireBusinessPermission('settings:manage'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const input = createGarmentTemplateSchema.parse(req.body);
  if (!uniqueTemplateKeys(input.fields)) {
    throw new HttpError(400, 'Garment template field keys must be unique', 'DUPLICATE_TEMPLATE_FIELD');
  }
  try {
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.garmentTemplate.create({
        data: { businessId, name: input.name, fields: input.fields },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'garment_template.created',
          entityType: 'garment_template',
          entityId: created.id,
          metadata: { fieldCount: input.fields.length },
          requestId: req.requestId,
        },
      });
      return created;
    });
    res.status(201).json({ data: template });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A garment template with this name already exists', 'DUPLICATE_GARMENT_TEMPLATE');
    }
    throw error;
  }
}));

router.get('/customers/:customerId', requireBusinessPermission('measurements:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const customerId = idSchema.parse(req.params.customerId);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  const profiles = await prisma.measurementProfile.findMany({
    where: { businessId, customerId },
    include: {
      garmentTemplate: { select: { id: true, name: true, fields: true } },
      revisions: { orderBy: [{ measuredAt: 'desc' }, { version: 'desc' }] },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: { items: profiles } });
}));

router.post('/customers/:customerId/revisions', requireBusinessPermission('measurements:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const customerId = idSchema.parse(req.params.customerId);
  const input = createMeasurementRevisionSchema.parse(req.body);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');

  const template = await prisma.garmentTemplate.findFirst({
    where: {
      id: input.garmentTemplateId,
      active: true,
      OR: [{ businessId }, { businessId: null }],
    },
    select: { id: true, fields: true },
  });
  if (!template) throw new HttpError(404, 'Garment template not found', 'GARMENT_TEMPLATE_NOT_FOUND');

  const fieldsResult = z.array(garmentTemplateFieldSchema).safeParse(template.fields);
  if (!fieldsResult.success) {
    throw new HttpError(500, 'Garment template configuration is invalid', 'INVALID_TEMPLATE_CONFIGURATION');
  }
  if (!uniqueTemplateKeys(fieldsResult.data)) {
    throw new HttpError(500, 'Garment template configuration contains duplicate fields', 'INVALID_TEMPLATE_CONFIGURATION');
  }
  const fieldKeys = new Set(fieldsResult.data.map((field) => field.key));
  const unknownField = Object.keys(input.values).find((key) => !fieldKeys.has(key));
  if (unknownField) throw new HttpError(400, 'Measurement contains a field not defined by its template', 'UNKNOWN_MEASUREMENT_FIELD');
  const missingField = fieldsResult.data.find((field) => field.required && input.values[field.key] === undefined);
  if (missingField) {
    throw new HttpError(400, `Measurement field "${missingField.label}" is required`, 'REQUIRED_MEASUREMENT_MISSING');
  }

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.measurementProfile.upsert({
      where: {
        businessId_customerId_garmentTemplateId: {
          businessId,
          customerId,
          garmentTemplateId: template.id,
        },
      },
      update: {},
      create: { businessId, customerId, garmentTemplateId: template.id },
    });
    const previous = await tx.measurementRevision.aggregate({
      where: { profileId: profile.id },
      _max: { version: true },
    });
    const revision = await tx.measurementRevision.create({
      data: {
        profileId: profile.id,
        version: (previous._max.version ?? 0) + 1,
        values: input.values,
        notes: input.notes,
        measuredAt: new Date(input.measuredAt),
      },
    });
    await queueMeasurementAppended(tx, revision.id);
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId,
        action: 'measurement.revision_created',
        entityType: 'measurement_revision',
        entityId: revision.id,
        metadata: { profileId: profile.id, version: revision.version },
        requestId: req.requestId,
      },
    });
    return { profile, revision };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  res.status(201).json({ data: result });
}));

export default router;
