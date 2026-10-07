import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requirePlatformPermission, requireSuperAdminPermission } from '../middleware/auth.js';
import { generateSubscriptionReceiptPdf, queueSubscriptionPaymentNotification } from '../whatsapp.js';

const router = express.Router();
const idSchema = z.string().uuid();
const paginationSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ADJUSTED', 'ALL']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const planSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  monthlyPrice: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  yearlyPrice: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  trialDays: z.number().int().min(0).max(365),
  features: z.record(z.string(), z.boolean()),
  limits: z.record(z.string(), z.number().int().min(-1)),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
const billingSchema = z.object({
  paymentMethods: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
  paymentInstructions: z.string().max(4000),
  gracePeriodDays: z.number().int().min(0).max(90),
  expiryReminderDays: z.array(z.number().int().min(0).max(365)).max(20),
  enforcementEnabled: z.boolean(),
  supportContact: z.string().max(200),
});

// Older installations may not have received the subscription migration/seed yet.
// Returning a valid, safe configuration keeps the settings screen usable and lets a
// platform administrator save the setting instead of exposing a raw Zod 400 error.
const defaultBillingSettings = {
  paymentMethods: ['BANK TRANSFER', 'EASYPAISA', 'JAZZCASH', 'CASH'],
  paymentInstructions: '',
  gracePeriodDays: 7,
  expiryReminderDays: [14, 7, 3, 1],
  enforcementEnabled: false,
  supportContact: '',
};

function parseBillingSettings(value: unknown) {
  const parsed = billingSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultBillingSettings;
}
const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE') }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(5).max(1000) }),
  z.object({ decision: z.literal('UNDER_REVIEW') }),
]);
const assignSchema = z.object({
  planId: idSchema,
  cycle: z.enum(['MONTHLY', 'YEARLY', 'CUSTOM']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(['ACTIVE', 'TRIAL']),
  complimentary: z.boolean(),
  customPrice: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
  discountAmount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).default('0'),
  reason: z.string().trim().min(5).max(1000),
});
const lifecycleSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']),
  endsAt: z.string().datetime().optional(),
  reason: z.string().trim().min(5).max(1000),
});
const adjustmentSchema = z.object({
  kind: z.enum(['REFUND_RECORDED', 'ADJUSTMENT_RECORDED']),
  amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  reason: z.string().trim().min(5).max(1000),
});
const reportSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function actorId(req: express.Request): string {
  if (req.auth?.scope !== 'platform') throw new HttpError(403, 'Platform access is required', 'PLATFORM_ACCESS_DENIED');
  return req.auth.userId;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

async function settingValue(tx: Prisma.TransactionClient | typeof prisma, key: string): Promise<unknown> {
  return (await tx.platformSetting.findUnique({ where: { key }, select: { value: true } }))?.value;
}

async function graceDays(tx: Prisma.TransactionClient | typeof prisma): Promise<number> {
  const value = await settingValue(tx, 'billing');
  if (typeof value === 'object' && value !== null && 'gracePeriodDays' in value
    && typeof value.gracePeriodDays === 'number' && Number.isInteger(value.gracePeriodDays)) {
    return value.gracePeriodDays;
  }
  return 7;
}

router.use(authenticate);

router.get('/dashboard', requirePlatformPermission('platform:subscriptions:read'), asyncHandler(async (_req, res) => {
  const now = new Date();
  const billingValue = await settingValue(prisma, 'billing');
  const configuredReminderDays = typeof billingValue === 'object' && billingValue !== null
    && 'expiryReminderDays' in billingValue && Array.isArray(billingValue.expiryReminderDays)
    ? billingValue.expiryReminderDays.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0)
    : [];
  const alertWindowDays = configuredReminderDays.length ? Math.max(...configuredReminderDays) : 30;
  const [businesses, subscriptions, pendingPayments, approvedPayments, refunds, expiring, recentActivity] = await Promise.all([
    prisma.business.count(),
    prisma.subscription.findMany({
      where: { status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] } },
      select: { businessId: true, status: true, endsAt: true, graceUntil: true, grandfathered: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.subscriptionPayment.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.subscriptionPayment.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true }, _count: true }),
    prisma.subscriptionEvent.findMany({ where: { action: 'refund_recorded' }, select: { metadata: true } }),
    prisma.subscription.findMany({
      where: { status: { in: ['TRIAL', 'ACTIVE'] }, endsAt: { gte: now, lte: new Date(now.getTime() + alertWindowDays * 86400000) } },
      include: { business: { select: { id: true, name: true } }, plan: { select: { name: true } } },
      orderBy: { endsAt: 'asc' },
      take: 20,
    }),
    prisma.subscriptionEvent.findMany({
      include: { business: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);
  const latest = new Map<string, (typeof subscriptions)[number]>();
  for (const subscription of subscriptions) {
    if (!latest.has(subscription.businessId)) latest.set(subscription.businessId, subscription);
  }
  const activeCount = [...latest.values()].filter((item) =>
    !item.grandfathered && item.status === 'ACTIVE' && (item.endsAt > now || item.graceUntil > now)).length;
  const trialCount = [...latest.values()].filter((item) => item.status === 'TRIAL' && item.endsAt > now).length;
  const complimentaryCount = [...latest.values()].filter((item) => item.grandfathered && item.status === 'ACTIVE').length;
  const expiredCount = [...latest.values()].filter((item) =>
    item.status === 'EXPIRED' || (item.status !== 'SUSPENDED' && item.status !== 'CANCELLED' && item.endsAt <= now && item.graceUntil <= now)).length;
  const refunded = refunds.reduce((total, item) => {
    if (typeof item.metadata !== 'object' || item.metadata === null || !('amount' in item.metadata)
      || typeof item.metadata.amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(item.metadata.amount)) return total;
    return total.plus(new Prisma.Decimal(item.metadata.amount));
  }, new Prisma.Decimal(0));
  res.json({
    data: {
      businesses,
      active: activeCount,
      trial: trialCount,
      complimentary: complimentaryCount,
      expired: expiredCount,
      pendingPayments,
      recordedRevenue: (approvedPayments._sum.amount ?? new Prisma.Decimal(0)).minus(refunded).toFixed(2),
      approvedPaymentCount: approvedPayments._count,
      expiring,
      recentActivity,
    },
  });
}));

router.get('/plans', asyncHandler(async (req, res, next) => {
  if (req.auth?.scope !== 'platform'
    || (!req.auth.platformPermissions.includes('platform:subscriptions:read')
      && !req.auth.platformPermissions.includes('platform:plans:manage'))) {
    next(new HttpError(403, 'Platform permission is not granted', 'PLATFORM_PERMISSION_DENIED'));
    return;
  }
  const plans = await prisma.subscriptionPlan.findMany({
    include: { _count: { select: { subscriptions: true, payments: true } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  res.json({ data: { items: plans } });
}));

router.post('/plans', requirePlatformPermission('platform:plans:manage'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const input = planSchema.parse(req.body);
  if (input.isDefault && !input.active) {
    throw new HttpError(400, 'The default plan must be active', 'DEFAULT_PLAN_MUST_BE_ACTIVE');
  }
  if (new Prisma.Decimal(input.monthlyPrice).lt(0) || new Prisma.Decimal(input.yearlyPrice).lt(0)) {
    throw new HttpError(400, 'Plan prices cannot be negative', 'INVALID_PLAN_PRICE');
  }
  try {
    const plan = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.subscriptionPlan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      const created = await tx.subscriptionPlan.create({
        data: {
          ...input,
          monthlyPrice: new Prisma.Decimal(input.monthlyPrice),
          yearlyPrice: new Prisma.Decimal(input.yearlyPrice),
        },
      });
      await tx.auditEvent.create({
        data: { actorId: actor, action: 'platform.subscription_plan_created', entityType: 'subscription_plan', entityId: created.id, requestId: req.requestId, metadata: { name: created.name } },
      });
      return created;
    });
    res.status(201).json({ data: plan });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Another default plan was configured concurrently; refresh and retry', 'DEFAULT_PLAN_CONFLICT');
    }
    throw error;
  }
}));

router.patch('/plans/:planId', requirePlatformPermission('platform:plans:manage'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const planId = idSchema.parse(req.params.planId);
  const input = planSchema.partial().parse(req.body);
  if (input.isDefault === true && input.active === false) {
    throw new HttpError(400, 'The default plan must be active', 'DEFAULT_PLAN_MUST_BE_ACTIVE');
  }
  if (input.monthlyPrice !== undefined && new Prisma.Decimal(input.monthlyPrice).lt(0)
    || input.yearlyPrice !== undefined && new Prisma.Decimal(input.yearlyPrice).lt(0)) {
    throw new HttpError(400, 'Plan prices cannot be negative', 'INVALID_PLAN_PRICE');
  }
  try {
    const plan = await prisma.$transaction(async (tx) => {
      const existing = await tx.subscriptionPlan.findUnique({ where: { id: planId }, select: { id: true, isDefault: true } });
      if (!existing) throw new HttpError(404, 'Subscription plan not found', 'PLAN_NOT_FOUND');
      if (existing.isDefault && input.active === false && input.isDefault !== true) {
        throw new HttpError(409, 'Select another active default plan before deactivating this plan', 'DEFAULT_PLAN_REQUIRED');
      }
      if (input.isDefault) await tx.subscriptionPlan.updateMany({ where: { isDefault: true, id: { not: planId } }, data: { isDefault: false } });
      const updated = await tx.subscriptionPlan.update({
        where: { id: planId },
        data: {
          ...input,
          ...(input.monthlyPrice === undefined ? {} : { monthlyPrice: new Prisma.Decimal(input.monthlyPrice) }),
          ...(input.yearlyPrice === undefined ? {} : { yearlyPrice: new Prisma.Decimal(input.yearlyPrice) }),
        },
      });
      await tx.auditEvent.create({
        data: { actorId: actor, action: 'platform.subscription_plan_updated', entityType: 'subscription_plan', entityId: planId, requestId: req.requestId, metadata: { changedFields: Object.keys(input) } },
      });
      return updated;
    });
    res.json({ data: plan });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Another default plan was configured concurrently; refresh and retry', 'DEFAULT_PLAN_CONFLICT');
    }
    throw error;
  }
}));

router.get('/payments', requirePlatformPermission('platform:payments:review'), asyncHandler(async (req, res) => {
  const query = paginationSchema.parse(req.query);
  const where: Prisma.SubscriptionPaymentWhereInput = {
    ...(query.status === 'ALL' ? {} : { status: query.status ?? { in: ['PENDING', 'UNDER_REVIEW'] } }),
    ...(query.q ? { OR: [
      { transactionReference: { contains: query.q, mode: 'insensitive' } },
      { senderName: { contains: query.q, mode: 'insensitive' } },
      { business: { name: { contains: query.q, mode: 'insensitive' } } },
    ] } : {}),
  };
  const rows = await prisma.subscriptionPayment.findMany({
    where,
    include: {
      business: { select: { id: true, name: true, slug: true } },
      plan: { select: { name: true } },
      submittedBy: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
      subscription: { select: { startsAt: true, endsAt: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

router.get('/payments/:paymentId/receipt.pdf', requirePlatformPermission('platform:payments:review'), asyncHandler(async (req, res) => {
  const paymentId = idSchema.parse(req.params.paymentId);
  const payment = await prisma.subscriptionPayment.findFirst({
    where: { id: paymentId, status: 'APPROVED', invoiceNumber: { not: null } },
    include: {
      business: { select: { name: true } },
      plan: { select: { name: true } },
      subscription: { select: { startsAt: true, endsAt: true } },
    },
  });
  if (!payment?.invoiceNumber || !payment.subscription) {
    throw new HttpError(404, 'Approved subscription receipt not found', 'SUBSCRIPTION_RECEIPT_NOT_FOUND');
  }
  const pdf = await generateSubscriptionReceiptPdf({
    businessName: payment.business.name,
    planName: payment.plan.name,
    cycle: payment.cycle,
    amount: payment.amount.toFixed(2),
    transactionReference: payment.transactionReference,
    senderName: payment.senderName,
    paymentMethod: payment.method,
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    invoiceNumber: payment.invoiceNumber,
    startsAt: payment.subscription.startsAt.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }),
    endsAt: payment.subscription.endsAt.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }),
  });
  res.type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="${payment.invoiceNumber}.pdf"`)
    .send(pdf);
}));

router.patch('/payments/:paymentId/review', requireSuperAdminPermission('platform:payments:review'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const paymentId = idSchema.parse(req.params.paymentId);
  const input = reviewSchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: { plan: true },
    });
    if (!payment) throw new HttpError(404, 'Subscription payment not found', 'PAYMENT_NOT_FOUND');
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${payment.businessId}::uuid FOR UPDATE`;
    if (!['PENDING', 'UNDER_REVIEW'].includes(payment.status)) {
      throw new HttpError(409, 'This payment has already been reviewed', 'PAYMENT_ALREADY_REVIEWED');
    }
    if (input.decision === 'UNDER_REVIEW') {
      const updated = await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: 'UNDER_REVIEW', reviewedById: actor, reviewedAt: new Date() },
        include: { plan: { select: { name: true } } },
      });
      await tx.subscriptionEvent.create({
        data: { businessId: payment.businessId, paymentId: payment.id, actorId: actor, action: 'payment.marked_under_review', metadata: {} },
      });
      await tx.auditEvent.create({
        data: { businessId: payment.businessId, actorId: actor, action: 'platform.subscription_payment_under_review', entityType: 'subscription_payment', entityId: payment.id, requestId: req.requestId, metadata: {} },
      });
      await queueSubscriptionPaymentNotification(tx, payment.id, 'SUBSCRIPTION_PAYMENT_UNDER_REVIEW');
      return { payment: updated, subscription: null };
    }
    if (input.decision === 'REJECT') {
      const updated = await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: 'REJECTED', reviewedById: actor, reviewedAt: new Date(), rejectionReason: input.reason },
        include: { plan: { select: { name: true } } },
      });
      await tx.subscriptionEvent.create({
        data: { businessId: payment.businessId, paymentId: payment.id, actorId: actor, action: 'payment.rejected', metadata: { reason: input.reason } },
      });
      await tx.auditEvent.create({
        data: { businessId: payment.businessId, actorId: actor, action: 'platform.subscription_payment_rejected', entityType: 'subscription_payment', entityId: payment.id, requestId: req.requestId, metadata: { reason: input.reason } },
      });
      await queueSubscriptionPaymentNotification(tx, payment.id, 'SUBSCRIPTION_PAYMENT_REJECTED', input.reason);
      return { payment: updated, subscription: null };
    }
    const changed = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
      data: { status: 'APPROVED', reviewedById: actor, reviewedAt: new Date() },
    });
    if (changed.count !== 1) throw new HttpError(409, 'This payment has already been reviewed', 'PAYMENT_ALREADY_REVIEWED');
    const now = new Date();
    const current = await tx.subscription.findFirst({
      where: { businessId: payment.businessId, grandfathered: false, status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED'] } },
      orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
    });
    const legacyAccess = await tx.subscription.findMany({
      where: { businessId: payment.businessId, grandfathered: true, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const legacy of legacyAccess) {
      await tx.subscription.update({ where: { id: legacy.id }, data: { status: 'EXPIRED', graceUntil: now } });
      await tx.subscriptionEvent.create({
        data: {
          businessId: payment.businessId,
          subscriptionId: legacy.id,
          paymentId: payment.id,
          actorId: actor,
          action: 'subscription.legacy_access_retired',
          metadata: { reason: 'First approved paid subscription' },
        },
      });
    }
    const startsAt = current && current.endsAt > now ? current.endsAt : now;
    const endsAt = payment.cycle === 'YEARLY' ? addMonths(startsAt, 12) : addMonths(startsAt, 1);
    const grace = await graceDays(tx);
    if (current && current.status !== 'EXPIRED') {
      await tx.subscription.update({ where: { id: current.id }, data: { status: 'EXPIRED' } });
    }
    const subscription = await tx.subscription.create({
      data: {
        businessId: payment.businessId,
        planId: payment.planId,
        status: 'ACTIVE',
        cycle: payment.cycle,
        startsAt,
        endsAt,
        graceUntil: new Date(endsAt.getTime() + grace * 86400000),
        discountAmount: payment.discountAmount,
      },
    });
    const invoiceNumber = `SUB-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${payment.id.slice(0, 8).toUpperCase()}`;
    const updated = await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: { subscriptionId: subscription.id, invoiceNumber },
      include: { plan: { select: { name: true } } },
    });
    await tx.subscriptionEvent.create({
      data: {
        businessId: payment.businessId,
        subscriptionId: subscription.id,
        paymentId: payment.id,
        actorId: actor,
        action: 'payment.approved_subscription_activated',
        metadata: { invoiceNumber, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), amount: payment.amount.toFixed(2) },
      },
    });
    await tx.auditEvent.create({
      data: { businessId: payment.businessId, actorId: actor, action: 'platform.subscription_payment_approved', entityType: 'subscription_payment', entityId: payment.id, requestId: req.requestId, metadata: { subscriptionId: subscription.id, invoiceNumber } },
    });
    await queueSubscriptionPaymentNotification(tx, payment.id, 'SUBSCRIPTION_PAYMENT_APPROVED');
    return { payment: updated, subscription };
  }, { maxWait: 10_000, timeout: 30_000 });
  res.json({ data: result });
}));

router.get('/businesses/:businessId', requirePlatformPermission('platform:subscriptions:read'), asyncHandler(async (req, res) => {
  const businessId = idSchema.parse(req.params.businessId);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, slug: true, status: true, createdAt: true, _count: { select: { memberships: true } } },
  });
  if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  const [subscriptions, payments, events] = await Promise.all([
    prisma.subscription.findMany({ where: { businessId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
    prisma.subscriptionPayment.findMany({ where: { businessId }, include: { plan: true, reviewedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.subscriptionEvent.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  res.json({ data: { business, subscriptions, payments, events } });
}));

router.get('/businesses', requirePlatformPermission('platform:subscriptions:read'), asyncHandler(async (req, res) => {
  const query = paginationSchema.pick({ q: true, cursor: true, limit: true }).parse(req.query);
  const rows = await prisma.business.findMany({
    where: query.q ? { OR: [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
    ] } : {},
    select: { id: true, name: true, slug: true, status: true, createdAt: true, _count: { select: { memberships: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null } });
}));

router.post('/businesses/:businessId/subscriptions', requirePlatformPermission('platform:subscriptions:manage'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const businessId = idSchema.parse(req.params.businessId);
  const input = assignSchema.parse(req.body);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const customPrice = input.customPrice === undefined ? null : new Prisma.Decimal(input.customPrice);
  const discountAmount = new Prisma.Decimal(input.discountAmount);
  if (endsAt <= startsAt || (customPrice && customPrice.lt(0)) || discountAmount.lt(0)) {
    throw new HttpError(400, 'Subscription dates and pricing are invalid', 'INVALID_SUBSCRIPTION');
  }
  if (!input.complimentary && customPrice === null) {
    throw new HttpError(400, 'Choose complimentary access or provide a custom price', 'SUBSCRIPTION_PRICE_REQUIRED');
  }
  const subscription = await prisma.$transaction(async (tx) => {
    const [business, plan] = await Promise.all([
      tx.business.findUnique({ where: { id: businessId }, select: { id: true } }),
      tx.subscriptionPlan.findFirst({
        where: { id: input.planId, active: true },
        select: { id: true, monthlyPrice: true, yearlyPrice: true },
      }),
    ]);
    if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
    if (!plan) throw new HttpError(404, 'Active subscription plan not found', 'PLAN_NOT_FOUND');
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${businessId}::uuid FOR UPDATE`;
    const basePrice = customPrice ?? (input.cycle === 'MONTHLY' ? plan.monthlyPrice : input.cycle === 'YEARLY' ? plan.yearlyPrice : new Prisma.Decimal(0));
    if (discountAmount.gt(basePrice) || (!input.complimentary && basePrice.minus(discountAmount).lte(0))) {
      throw new HttpError(400, 'Discount must be less than the assigned subscription price', 'INVALID_SUBSCRIPTION_DISCOUNT');
    }
    await tx.subscription.updateMany({
      where: { businessId, status: { in: ['TRIAL', 'ACTIVE'] } },
      data: { status: 'EXPIRED', graceUntil: new Date() },
    });
    const created = await tx.subscription.create({
      data: {
        businessId, planId: plan.id, status: input.status, cycle: input.cycle,
        startsAt, endsAt, graceUntil: new Date(endsAt.getTime() + (await graceDays(tx)) * 86400000),
        complimentary: input.complimentary, customPrice, discountAmount,
      },
    });
    await tx.subscriptionEvent.create({
      data: { businessId, subscriptionId: created.id, actorId: actor, action: 'subscription.admin_assigned', metadata: { reason: input.reason, complimentary: input.complimentary, customPrice: customPrice?.toFixed(2) ?? null, discountAmount: discountAmount.toFixed(2) } },
    });
    await tx.auditEvent.create({
      data: { businessId, actorId: actor, action: 'platform.subscription_assigned', entityType: 'subscription', entityId: created.id, requestId: req.requestId, metadata: { reason: input.reason, status: input.status } },
    });
    return created;
  });
  res.status(201).json({ data: subscription });
}));

router.patch('/subscriptions/:subscriptionId/status', requirePlatformPermission('platform:subscriptions:manage'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const subscriptionId = idSchema.parse(req.params.subscriptionId);
  const input = lifecycleSchema.parse(req.body);
  const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
  const subscription = await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { id: subscriptionId } });
    if (!existing) throw new HttpError(404, 'Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${existing.businessId}::uuid FOR UPDATE`;
    if (input.status === 'ACTIVE' && !(endsAt ?? existing.endsAt).getTime()) {
      throw new HttpError(400, 'An active subscription requires a valid expiry date', 'INVALID_SUBSCRIPTION_DATE');
    }
    if (input.status === 'ACTIVE' && (endsAt ?? existing.endsAt) <= new Date()) {
      throw new HttpError(400, 'Set a future expiry date before reactivation', 'INVALID_SUBSCRIPTION_DATE');
    }
    if (input.status === 'ACTIVE') {
      await tx.subscription.updateMany({
        where: { businessId: existing.businessId, id: { not: subscriptionId }, status: { in: ['TRIAL', 'ACTIVE'] } },
        data: { status: 'EXPIRED', graceUntil: new Date() },
      });
    }
    const next = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: input.status,
        ...(endsAt ? { endsAt, graceUntil: new Date(endsAt.getTime() + (await graceDays(tx)) * 86400000) } : {}),
        suspendedAt: input.status === 'SUSPENDED' ? new Date() : null,
        cancelledAt: input.status === 'CANCELLED' ? new Date() : null,
      },
    });
    await tx.subscriptionEvent.create({
      data: { businessId: existing.businessId, subscriptionId, actorId: actor, action: `subscription.${input.status.toLowerCase()}`, metadata: { reason: input.reason, endsAt: (endsAt ?? existing.endsAt).toISOString() } },
    });
    await tx.auditEvent.create({
      data: { businessId: existing.businessId, actorId: actor, action: `platform.subscription_${input.status.toLowerCase()}`, entityType: 'subscription', entityId: subscriptionId, requestId: req.requestId, metadata: { reason: input.reason } },
    });
    return next;
  });
  res.json({ data: subscription });
}));

router.post('/payments/:paymentId/adjustments', requireSuperAdminPermission('platform:payments:review'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const paymentId = idSchema.parse(req.params.paymentId);
  const input = adjustmentSchema.parse(req.body);
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) throw new HttpError(400, 'Adjustment amount must be greater than zero', 'INVALID_ADJUSTMENT');
  const record = await prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== 'APPROVED') {
      throw new HttpError(409, 'Only approved subscription payments can be adjusted', 'PAYMENT_NOT_ADJUSTABLE');
    }
    await tx.$queryRaw`SELECT "id" FROM "SubscriptionPayment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`;
    if (input.kind === 'REFUND_RECORDED') {
      const priorRefunds = await tx.subscriptionEvent.findMany({
        where: { paymentId, action: 'refund_recorded' },
        select: { metadata: true },
      });
      const alreadyRefunded = priorRefunds.reduce((total, item) => {
        if (typeof item.metadata !== 'object' || item.metadata === null || !('amount' in item.metadata)
          || typeof item.metadata.amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(item.metadata.amount)) return total;
        return total.plus(new Prisma.Decimal(item.metadata.amount));
      }, new Prisma.Decimal(0));
      if (alreadyRefunded.plus(amount).gt(payment.amount)) {
        throw new HttpError(409, 'Recorded refunds cannot exceed the approved payment amount', 'REFUND_EXCEEDS_PAYMENT');
      }
    }
    const event = await tx.subscriptionEvent.create({
      data: {
        businessId: payment.businessId,
        paymentId,
        actorId: actor,
        action: input.kind.toLowerCase(),
        metadata: { amount: amount.toFixed(2), reason: input.reason, externalProcessingConfirmed: false },
      },
    });
    await tx.auditEvent.create({
      data: { businessId: payment.businessId, actorId: actor, action: `platform.subscription_${input.kind.toLowerCase()}`, entityType: 'subscription_payment', entityId: paymentId, requestId: req.requestId, metadata: { amount: amount.toFixed(2), reason: input.reason, eventId: event.id } },
    });
    return event;
  });
  res.status(201).json({ data: record });
}));

router.get('/settings', requirePlatformPermission('platform:billing:settings'), asyncHandler(async (_req, res) => {
  const value = await settingValue(prisma, 'billing');
  res.json({ data: parseBillingSettings(value) });
}));

router.put('/settings', requirePlatformPermission('platform:billing:settings'), asyncHandler(async (req, res) => {
  const actor = actorId(req);
  const input = billingSchema.parse(req.body);
  const setting = await prisma.$transaction(async (tx) => {
    const updated = await tx.platformSetting.upsert({
      where: { key: 'billing' },
      create: { key: 'billing', value: input },
      update: { value: input },
    });
    await tx.auditEvent.create({
      data: { actorId: actor, action: 'platform.billing_settings_updated', entityType: 'platform_setting', entityId: null, requestId: req.requestId, metadata: { changedFields: Object.keys(input) } },
    });
    return updated;
  });
  res.json({ data: billingSchema.parse(setting.value) });
}));

router.get('/report.csv', requirePlatformPermission('platform:reports:read'), asyncHandler(async (req, res) => {
  const query = reportSchema.parse(req.query);
  if (query.from && query.to && query.from > query.to) throw new HttpError(400, 'Report start date must precede end date', 'INVALID_DATE_RANGE');
  const dateRange = query.from || query.to ? {
    ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
    ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
  } : undefined;
  const [rows, adjustments] = await Promise.all([prisma.subscriptionPayment.findMany({
    where: {
      ...(dateRange ? { paymentDate: dateRange } : {}),
    },
    include: { business: { select: { name: true } }, plan: { select: { name: true } } },
    orderBy: { paymentDate: 'asc' },
  }), prisma.subscriptionEvent.findMany({
    where: {
      action: { in: ['refund_recorded', 'adjustment_recorded'] },
      ...(dateRange ? { createdAt: dateRange } : {}),
    },
    include: {
      business: { select: { name: true } },
      payment: { include: { plan: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })]);
  const quote = (rawValue: string) => {
    const value = /^[\s]*[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
    return `"${value.replaceAll('"', '""')}"`;
  };
  const lines = [
    ['Business', 'Plan', 'Status', 'Amount PKR', 'Method', 'Transaction reference', 'Sender', 'Payment date', 'Invoice'].map(quote).join(','),
    ...rows.map((item) => [
      item.business.name, item.plan.name, item.status, item.amount.toFixed(2), item.method,
      item.transactionReference, item.senderName, item.paymentDate.toISOString().slice(0, 10), item.invoiceNumber ?? '',
    ].map(quote).join(',')),
    ...adjustments.flatMap((event) => {
      const metadata = event.metadata;
      if (!event.payment || typeof metadata !== 'object' || metadata === null || !('amount' in metadata)
        || typeof metadata.amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(metadata.amount)) return [];
      return [[
        event.business.name,
        event.payment.plan.name,
        event.action === 'refund_recorded' ? 'REFUND_RECORDED' : 'ADJUSTMENT_RECORDED',
        event.action === 'refund_recorded' ? `-${metadata.amount}` : metadata.amount,
        event.payment.method,
        event.payment.transactionReference,
        event.payment.senderName,
        event.createdAt.toISOString().slice(0, 10),
        event.payment.invoiceNumber ?? '',
      ].map(quote).join(',')];
    }),
  ];
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="subscription-reconciliation.csv"');
  res.send(lines.join('\r\n'));
}));

export default router;
