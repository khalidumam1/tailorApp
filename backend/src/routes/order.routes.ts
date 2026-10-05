import { Prisma, type CustomFieldDefinition } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  createAlterationSchema,
  createOrderSchema,
  orderQuerySchema,
  transitionOrderSchema,
  transitionWorkflowSchema,
} from '@tailor/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { calculateNetPaid, calculateOutstanding } from '../domain/finance.js';
import { customFieldValueData, validateCustomFieldValues } from '../domain/custom-fields.js';
import { isAllowedOrderTransition } from '../domain/orders.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { assertPlanLimit } from '../plan-limits.js';
import { queueOrderCreated, queueOrderReady, queueOrderStatusChanged } from '../whatsapp.js';

const router = express.Router();
const idSchema = z.string().uuid();
const itemTypesSchema = z.array(z.object({
  key: z.string(),
  label: z.string(),
}).strict());

function effectiveFields(
  templateFields: CustomFieldDefinition[],
  businessFields: CustomFieldDefinition[],
): CustomFieldDefinition[] {
  const byKey = new Map(templateFields.map((field) => [field.key, field]));
  for (const field of businessFields) byKey.set(field.key, field);
  return [...byKey.values()].filter((field) => field.active && field.module === 'orders');
}

function getContext(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}

function mapOrderWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    throw new HttpError(409, 'Order changed concurrently; refresh and retry', 'VERSION_CONFLICT');
  }
  throw error;
}

function fieldValuesMap(values: Array<{
  fieldDefinition: { key: string };
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueBoolean: boolean | null;
  valueDate: Date | null;
  valueJson: Prisma.JsonValue | null;
}>): Record<string, unknown> {
  return Object.fromEntries(values.map((entry) => [
    entry.fieldDefinition.key,
    entry.valueText
      ?? entry.valueNumber?.toString()
      ?? entry.valueBoolean
      ?? entry.valueDate?.toISOString()
      ?? entry.valueJson,
  ]));
}

router.use(authenticate);

router.get('/', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const query = orderQuerySchema.parse(req.query);
  if (query.cursor) {
    const cursorExists = await prisma.order.findFirst({
      where: { id: query.cursor, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!cursorExists) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }

  const orders = await prisma.order.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? {
        OR: [
          { orderNumber: { contains: query.q, mode: 'insensitive' } },
          { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      } : {}),
      ...(query.dueBefore || query.dueAfter ? {
        promisedAt: {
          ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
          ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
        },
      } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: {
        include: {
          customFieldValues: { include: { fieldDefinition: { select: { key: true } } } },
        },
      },
      customFieldValues: { include: { fieldDefinition: { select: { key: true } } } },
      currentWorkflowStage: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = orders.length > query.limit;
  const page = hasMore ? orders.slice(0, query.limit) : orders;
  const paymentTotals = page.length ? await prisma.payment.groupBy({
    by: ['orderId', 'kind'],
    where: { businessId, orderId: { in: page.map((order) => order.id) } },
    _sum: { amount: true },
  }) : [];

  const items = page.map((order) => {
    const payments = paymentTotals
      .filter((payment) => payment.orderId === order.id)
      .map((payment) => ({ kind: payment.kind, amount: payment._sum.amount ?? new Prisma.Decimal(0) }));
    const paid = calculateNetPaid(payments);
    return {
      ...order,
      customFields: fieldValuesMap(order.customFieldValues),
      items: order.items.map((item) => ({
        ...item,
        customFields: fieldValuesMap(item.customFieldValues),
      })),
      paid: paid.toFixed(2),
      outstanding: calculateOutstanding(order.total, payments).toFixed(2),
    };
  });
  res.json({ data: { items, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
}));

router.post('/', requireBusinessPermission('orders:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const input = createOrderSchema.parse(req.body);
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new HttpError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  const configuration = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      template: {
        include: {
          fields: { where: { active: true } },
          workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
          workflowTransitions: true,
        },
      },
      customFields: { where: { active: true } },
      workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      workflowTransitions: true,
    },
  });
  if (!configuration?.template) throw new HttpError(409, 'Business template configuration is unavailable', 'BUSINESS_TEMPLATE_MISSING');
  if (!configuration.template.enabledModules.includes('orders')) {
    throw new HttpError(403, 'The orders module is disabled for this business', 'BUSINESS_MODULE_DISABLED');
  }
  const itemTypes = itemTypesSchema.safeParse(configuration.template.itemTypes);
  if (!itemTypes.success || itemTypes.data.length === 0) {
    throw new HttpError(500, 'Business item types are invalid', 'INVALID_ITEM_TYPES');
  }
  const stages = configuration.workflowStages.length
    ? configuration.workflowStages
    : configuration.template.workflowStages;
  const initialStage = stages.find((stage) => stage.isInitial);
  if (!initialStage) throw new HttpError(409, 'The business workflow has no initial stage', 'INVALID_BUSINESS_WORKFLOW');
  const orderFields = effectiveFields(configuration.template.fields, configuration.customFields)
    .filter((field) => field.screen === 'order' || field.screen === 'job');
  const orderFieldValues = validateCustomFieldValues(orderFields, input.customFields ?? {});
  const itemFields = effectiveFields(configuration.template.fields, configuration.customFields)
    .filter((field) => field.screen === 'order-item' || field.screen === 'item');
  let total = new Prisma.Decimal(0);
  const items = await Promise.all(input.items.map(async (item) => {
    const itemTypeKey = item.itemTypeKey ?? itemTypes.data[0].key;
    if (!itemTypes.data.some((type) => type.key === itemTypeKey)) {
      throw new HttpError(400, 'Item type is not available for this business', 'INVALID_ITEM_TYPE');
    }
    const itemName = item.itemName ?? item.garmentName ?? '';
    const customFieldValues = validateCustomFieldValues(itemFields, {
      ...(item.customFields ?? {}),
      garment_name: itemName,
      quantity: item.quantity,
    }, { itemTypeKey });
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    total = total.plus(unitPrice.mul(item.quantity));
    let measurementSnapshot: Prisma.InputJsonObject = {};
    if (item.measurementProfileId) {
      const profile = await prisma.measurementProfile.findFirst({
        where: {
          id: item.measurementProfileId,
          businessId,
          customerId: input.customerId,
          garmentTemplate: { active: true },
        },
        include: {
          garmentTemplate: { select: { name: true } },
          revisions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
      const revision = profile?.revisions[0];
      if (!profile || !revision) {
        throw new HttpError(404, 'A current measurement profile was not found for this customer', 'MEASUREMENT_PROFILE_NOT_FOUND');
      }
      measurementSnapshot = {
        template: profile.garmentTemplate.name,
        revisionId: revision.id,
        revision: revision.version,
        measuredAt: revision.measuredAt.toISOString(),
        values: revision.values as Prisma.InputJsonObject,
      };
    }
    return {
      id: randomUUID(),
      businessId,
      itemTypeKey,
      itemName,
      garmentName: itemName.slice(0, 120),
      quantity: item.quantity,
      unitPrice,
      measurementSnapshot,
      customFieldValues,
    };
  }));

  if (total.greaterThan(new Prisma.Decimal('9999999999.99'))) {
    throw new HttpError(400, 'Order total exceeds the supported amount', 'ORDER_TOTAL_TOO_LARGE');
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      await assertPlanLimit(tx, businessId, 'orders:write');
      const catalogItems = await Promise.all(items.map(async (item) => {
        const catalogItem = await tx.businessItem.upsert({
          where: {
            businessId_typeKey_name: {
              businessId,
              typeKey: item.itemTypeKey,
              name: item.itemName,
            },
          },
          create: {
            businessId,
            typeKey: item.itemTypeKey,
            name: item.itemName,
          },
          update: { active: true },
          select: { id: true },
        });
        return { ...item, itemId: catalogItem.id };
      }));
      const business = await tx.business.update({
        where: { id: businessId },
        data: { orderSequence: { increment: 1 } },
        select: { slug: true, orderSequence: true },
      });
      const prefix = business.slug.split('-')[0].slice(0, 8).toUpperCase();
      const orderNumber = `${prefix}-${String(business.orderSequence).padStart(6, '0')}`;
      const created = await tx.order.create({
        data: {
          businessId,
          customerId: input.customerId,
          createdById: actorId,
          orderNumber,
          promisedAt: new Date(input.promisedAt),
          notes: input.notes,
          total,
          workflowStageId: initialStage.id,
          workflowStageKey: initialStage.key,
          items: { create: catalogItems.map(({ customFieldValues: _customFieldValues, businessId: _itemBusinessId, ...item }) => item) },
          workflowHistory: {
            create: {
              fromStageKey: null,
              toStageId: initialStage.id,
              toStageKey: initialStage.key,
              toStageLabel: initialStage.label,
              changedById: actorId,
            },
          },
          statusHistory: { create: { fromStatus: null, toStatus: 'NEW', changedById: actorId } },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: true,
          currentWorkflowStage: true,
          workflowHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
      const customValues = [
        ...orderFieldValues.map((value) => ({
          businessId,
          orderId: created.id,
          ...customFieldValueData(value),
        })),
        ...items.flatMap((item) => item.customFieldValues.map((value) => ({
          businessId,
          orderItemId: item.id,
          ...customFieldValueData(value),
        }))),
      ];
      if (customValues.length) await tx.customFieldValue.createMany({ data: customValues });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'order.created',
          entityType: 'order',
          entityId: created.id,
          metadata: { orderNumber: created.orderNumber, total: total.toFixed(2) },
          requestId: req.requestId,
        },
      });
      await queueOrderCreated(tx, created.id);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json({ data: order });
  } catch (error) {
    mapOrderWriteError(error);
  }
}));

router.post('/:orderId/workflow', requireBusinessPermission('orders:transition'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const input = transitionWorkflowSchema.parse(req.body);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, businessId, deletedAt: null },
        include: {
          currentWorkflowStage: true,
          business: {
            include: {
              configuration: true,
              template: {
                include: {
                  workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
                  workflowTransitions: true,
                },
              },
              workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
              workflowTransitions: true,
            },
          },
        },
      });
      if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
      if (order.version !== input.version) {
        throw new HttpError(409, 'Order changed since it was loaded; refresh before updating', 'VERSION_CONFLICT');
      }
      const stages = order.business.workflowStages.length
        ? order.business.workflowStages : order.business.template?.workflowStages ?? [];
      const transitions = order.business.workflowStages.length
        ? order.business.workflowTransitions : order.business.template?.workflowTransitions ?? [];
      const fromStage = stages.find((stage) => stage.key === order.workflowStageKey)
        ?? order.currentWorkflowStage
        ?? stages.find((stage) => stage.key === order.status);
      const toStage = stages.find((stage) => stage.key === input.toStageKey);
      if (!fromStage || !toStage) {
        throw new HttpError(409, 'Order stage is not available in the published workflow', 'WORKFLOW_STAGE_UNAVAILABLE');
      }
      const transition = transitions.find((candidate) =>
        candidate.fromStageId === fromStage.id && candidate.toStageId === toStage.id);
      if (!transition) {
        throw new HttpError(409, `Transition from ${fromStage.label} to ${toStage.label} is not allowed`, 'INVALID_WORKFLOW_TRANSITION');
      }
      if (transition.allowedRoleKeys.length > 0
        ) {
        const membership = await tx.membership.findFirst({
          where: { id: req.auth?.membershipId, businessId, userId: actorId },
          select: { role: { select: { name: true } } },
        });
        if (!membership || !transition.allowedRoleKeys.includes(membership.role.name)) {
          throw new HttpError(403, 'Your business role cannot perform this workflow transition', 'WORKFLOW_ROLE_DENIED');
        }
      }
      const result = await tx.order.updateMany({
        where: { id: order.id, businessId, version: input.version, deletedAt: null },
        data: {
          workflowStageId: toStage.id,
          workflowStageKey: toStage.key,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new HttpError(409, 'Order changed concurrently; refresh and retry', 'VERSION_CONFLICT');
      await tx.orderWorkflowHistory.create({
        data: {
          businessId,
          orderId,
          fromStageId: fromStage.id,
          toStageId: toStage.id,
          fromStageKey: fromStage.key,
          toStageKey: toStage.key,
          fromStageLabel: fromStage.label,
          toStageLabel: toStage.label,
          changedById: actorId,
          note: input.note,
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'order.workflow_stage_changed',
          entityType: 'order',
          entityId: orderId,
          metadata: { from: fromStage.key, to: toStage.key, configurationVersion: order.business.configuration?.version ?? 0 },
          requestId: req.requestId,
        },
      });
      await queueOrderStatusChanged(
        tx,
        order.id,
        fromStage.label,
        toStage.label,
        `status-changed:${order.id}:${order.version}:${toStage.id}`,
      );
      if (Array.isArray(toStage.actions) && toStage.actions.includes('ORDER_READY')) {
        await queueOrderReady(tx, order.id);
      }
      const resultOrder = await tx.order.findFirstOrThrow({
        where: { id: orderId, businessId },
        include: { currentWorkflowStage: true, workflowHistory: { orderBy: { createdAt: 'asc' } } },
      });
      return resultOrder;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json({ data: updated });
  } catch (error) {
    mapOrderWriteError(error);
  }
}));

router.post('/:orderId/status', requireBusinessPermission('orders:transition'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const input = transitionOrderSchema.parse(req.body);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      currentWorkflowStage: true,
      business: {
        include: {
          template: {
            include: {
              workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
              workflowTransitions: true,
            },
          },
          workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
          workflowTransitions: true,
        },
      },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (order.version !== input.version) {
    throw new HttpError(409, 'Order changed since it was loaded; refresh before updating', 'VERSION_CONFLICT');
  }
  const stages = order.business.workflowStages.length
    ? order.business.workflowStages : order.business.template?.workflowStages ?? [];
  const transitions = order.business.workflowStages.length
    ? order.business.workflowTransitions : order.business.template?.workflowTransitions ?? [];
  const targetKey = input.toStatus === 'FINISHING' ? 'FITTING' : input.toStatus;
  const fromStage = stages.find((stage) => stage.key === order.workflowStageKey)
    ?? stages.find((stage) => stage.id === order.workflowStageId)
    ?? stages.find((stage) => stage.key === order.status);
  const toStage = stages.find((stage) => stage.key === targetKey);
  const configuredTransition = fromStage && toStage
    ? transitions.find((transition) => transition.fromStageId === fromStage.id && transition.toStageId === toStage.id)
    : undefined;
  if (fromStage && toStage) {
    if (!configuredTransition) {
      throw new HttpError(409, `Cannot transition order from ${fromStage.label} to ${toStage.label}`, 'INVALID_STATUS_TRANSITION');
    }
  } else if (!order.workflowStageId && !isAllowedOrderTransition(order.status, input.toStatus)) {
    throw new HttpError(409, `Cannot transition order from ${order.status} to ${input.toStatus}`, 'INVALID_STATUS_TRANSITION');
  } else if (order.workflowStageId) {
    throw new HttpError(409, 'The requested status is not part of the configured workflow', 'INVALID_STATUS_TRANSITION');
  }
  if (configuredTransition && configuredTransition.allowedRoleKeys.length > 0) {
    const membership = await prisma.membership.findFirst({
      where: { id: req.auth?.membershipId, businessId, userId: actorId },
      select: { role: { select: { name: true } } },
    });
    if (!membership || !configuredTransition.allowedRoleKeys.includes(membership.role.name)) {
      throw new HttpError(403, 'Your business role cannot perform this workflow transition', 'WORKFLOW_ROLE_DENIED');
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: order.id, businessId, status: order.status, version: input.version, deletedAt: null },
        data: {
          status: input.toStatus,
          ...(toStage ? { workflowStageId: toStage.id, workflowStageKey: toStage.key } : {}),
          version: { increment: 1 },
        },
      });
      if (!result.count) throw new HttpError(409, 'Order changed concurrently; refresh and retry', 'VERSION_CONFLICT');
      const next = await tx.order.findFirstOrThrow({ where: { id: order.id, businessId } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: input.toStatus,
          changedById: actorId,
          note: input.note,
        },
      });
      if (fromStage && toStage) {
        await tx.orderWorkflowHistory.create({
          data: {
            businessId,
            orderId: order.id,
            fromStageId: fromStage.id,
            toStageId: toStage.id,
            fromStageKey: fromStage.key,
            toStageKey: toStage.key,
            fromStageLabel: fromStage.label,
            toStageLabel: toStage.label,
            changedById: actorId,
            note: input.note,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          businessId,
          actorId,
          action: 'order.status_changed',
          entityType: 'order',
          entityId: order.id,
          metadata: { from: order.status, to: input.toStatus },
          requestId: req.requestId,
        },
      });
      await queueOrderStatusChanged(
        tx,
        order.id,
        fromStage?.label ?? order.status,
        toStage?.label ?? input.toStatus,
        `status-changed:${order.id}:${order.version}:${input.toStatus}`,
      );
      if (input.toStatus === 'READY_FOR_PICKUP') await queueOrderReady(tx, order.id);
      return next;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json({ data: updated });
  } catch (error) {
    mapOrderWriteError(error);
  }
}));

router.post('/:orderId/alterations', requireBusinessPermission('orders:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const input = createAlterationSchema.parse(req.body);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null, status: { not: 'CANCELLED' } },
    select: { id: true },
  });
  if (!order) throw new HttpError(404, 'Active order not found', 'ORDER_NOT_FOUND');
  const alteration = await prisma.$transaction(async (tx) => {
    const created = await tx.alterationTask.create({
      data: {
        orderId,
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    });
    await tx.auditEvent.create({
      data: {
        businessId,
        actorId,
        action: 'alteration.created',
        entityType: 'alteration',
        entityId: created.id,
        metadata: { orderId },
        requestId: req.requestId,
      },
    });
    return created;
  });
  res.status(201).json({ data: alteration });
}));

router.get('/:orderId', requireBusinessPermission('orders:read'), asyncHandler(async (req, res) => {
  const { businessId } = getContext(req);
  const orderId = idSchema.parse(req.params.orderId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
      currentWorkflowStage: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      workflowHistory: { orderBy: { createdAt: 'asc' } },
      alterations: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { createdAt: 'asc' } },
      customFieldValues: { include: { fieldDefinition: true } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'ORDER_NOT_FOUND');
  const totalPaid = calculateNetPaid(order.payments);
  res.json({
    data: {
      ...order,
      paid: totalPaid.toFixed(2),
      outstanding: calculateOutstanding(order.total, order.payments).toFixed(2),
    },
  });
}));

export default router;
