import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { generateSubscriptionReceiptPdf } from '../whatsapp.js';

const router = express.Router();
const paymentSchema = z.object({
  planId: z.string().uuid(),
  cycle: z.enum(['MONTHLY', 'YEARLY']),
  transactionReference: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._/-]+$/),
  senderName: z.string().trim().min(2).max(160),
  amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  method: z.string().trim().min(2).max(60),
  paymentDate: z.string().date(),
}).refine((input) => {
  const todayInKarachi = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return input.paymentDate <= todayInKarachi;
}, { message: 'Payment date cannot be in the future', path: ['paymentDate'] });

function businessId(req: express.Request): string {
  if (!req.auth?.business || !req.auth.membershipId) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return req.auth.business.id;
}

router.use(authenticate);

router.get('/', requireBusinessPermission('subscriptions:read'), asyncHandler(async (req, res) => {
  const id = businessId(req);
  const [subscriptionRecord, payments, setting] = await Promise.all([
    prisma.subscription.findFirst({
      where: { businessId: id },
      include: { plan: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.subscriptionPayment.findMany({
      where: { businessId: id },
      include: { plan: { select: { name: true } }, subscription: { select: { startsAt: true, endsAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } }),
  ]);
  const subscription = subscriptionRecord
    && ['TRIAL', 'ACTIVE'].includes(subscriptionRecord.status)
    && subscriptionRecord.endsAt <= new Date()
    ? { ...subscriptionRecord, status: 'EXPIRED' as const }
    : subscriptionRecord;
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { monthlyPrice: 'asc' }],
  });
  const billing = setting?.value;
  const paymentInstructions = typeof billing === 'object' && billing !== null && 'paymentInstructions' in billing
    && typeof billing.paymentInstructions === 'string' ? billing.paymentInstructions : '';
  const paymentMethods = typeof billing === 'object' && billing !== null && 'paymentMethods' in billing
    && Array.isArray(billing.paymentMethods) ? billing.paymentMethods.filter((item): item is string => typeof item === 'string') : [];
  const supportContact = typeof billing === 'object' && billing !== null && 'supportContact' in billing
    && typeof billing.supportContact === 'string' ? billing.supportContact : '';
  const events = await prisma.subscriptionEvent.findMany({
    where: { businessId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ data: { subscription, plans, payments, events, paymentInstructions, paymentMethods, supportContact } });
}));

router.get('/payments/:paymentId/receipt.pdf', requireBusinessPermission('subscriptions:read'), asyncHandler(async (req, res) => {
  const id = businessId(req);
  const paymentId = z.string().uuid().parse(req.params.paymentId);
  const payment = await prisma.subscriptionPayment.findFirst({
    where: { id: paymentId, businessId: id, status: 'APPROVED', invoiceNumber: { not: null } },
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

router.post('/payments', requireBusinessPermission('subscriptions:manage'), asyncHandler(async (req, res) => {
  const id = businessId(req);
  const actorId = req.auth?.userId;
  if (!actorId) throw new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
  const input = paymentSchema.parse(req.body);
  const setting = await prisma.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } });
  const billing = setting?.value;
  const configuredMethods = typeof billing === 'object' && billing !== null && 'paymentMethods' in billing
    && Array.isArray(billing.paymentMethods) ? billing.paymentMethods.filter((item): item is string => typeof item === 'string') : [];
  if (!configuredMethods.includes(input.method)) {
    throw new HttpError(400, 'Select a configured subscription payment method', 'INVALID_PAYMENT_METHOD');
  }
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: input.planId, active: true },
    select: { id: true, monthlyPrice: true, yearlyPrice: true },
  });
  if (!plan) throw new HttpError(404, 'Subscription plan is unavailable', 'PLAN_NOT_FOUND');
  const expected = input.cycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice;
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0) || !amount.equals(expected)) {
    throw new HttpError(400, 'Payment amount must match the configured plan price', 'PAYMENT_AMOUNT_MISMATCH');
  }
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPayment.create({
        data: {
          businessId: id,
          planId: plan.id,
          submittedById: actorId,
          cycle: input.cycle,
          transactionReference: input.transactionReference,
          senderName: input.senderName,
          amount,
          method: input.method,
          paymentDate: new Date(`${input.paymentDate}T00:00:00.000Z`),
          status: 'PENDING',
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          businessId: id,
          paymentId: created.id,
          actorId,
          action: 'payment.submitted',
          metadata: { amount: amount.toFixed(2), method: input.method, transactionReference: input.transactionReference },
        },
      });
      await tx.auditEvent.create({
        data: {
          businessId: id,
          actorId,
          action: 'subscription.payment_submitted',
          entityType: 'subscription_payment',
          entityId: created.id,
          requestId: req.requestId,
          metadata: { amount: amount.toFixed(2), method: input.method },
        },
      });
      return tx.subscriptionPayment.findUniqueOrThrow({
        where: { id: created.id },
        include: { plan: { select: { name: true } } },
      });
    });
    res.status(201).json({ data: payment });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'This transaction reference has already been submitted', 'DUPLICATE_TRANSACTION');
    }
    throw error;
  }
}));

export default router;
