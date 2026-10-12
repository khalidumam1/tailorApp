/**
 * Removes clearly identified demo customers / orders / payments / measurements.
 * Preserves businesses, users, roles, templates, catalog items, and configuration.
 *
 * Usage (from backend/):
 *   node scripts/cleanup-demo-operational-data.mjs
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
];
for (const envFile of new Set(candidates.filter((candidate) => existsSync(candidate)))) {
  loadDotEnv({ path: envFile, override: false });
}

const url = process.env.DATABASE_URL || '';
const host = (url.match(/@([^:/?]+)/) || [])[1] || 'unknown';
if (!url) {
  console.error('DATABASE_URL is not configured');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run demo cleanup with NODE_ENV=production');
  process.exit(1);
}

const DEMO_ORDER_NUMBERS = [
  'KARACHI-000001',
  'KARACHI-000002',
  'FURN-000001',
  'CARP-000001',
  'AUTO-000001',
  'PRINT-000001',
];
const DEMO_PAYMENT_KEYS = [
  'demo-advance-0001',
  'demo-advance-0002',
  'demo-payment-furniture',
  'demo-payment-carpenter',
  'demo-payment-auto',
  'demo-payment-printing',
];
const DEMO_PHONE_NORMALIZED = [
  '923001234567',
  '923211234567',
  '923001234501',
  '923001234502',
  '923001234503',
  '923001234504',
];

const prisma = new PrismaClient();

async function main() {
  console.log(JSON.stringify({
    action: 'cleanup-demo-operational-data',
    host,
    isPrisma: host.includes('prisma.io'),
    isSupabase: host.includes('supabase'),
  }, null, 2));

  const result = await prisma.$transaction(async (tx) => {
    const demoBusinesses = await tx.business.findMany({
      where: {
        slug: {
          in: [
            'karachi-demo-tailors',
            'furniture-demo',
            'carpenter-demo',
            'auto-workshop-demo',
            'printing-demo',
          ],
        },
      },
      select: { id: true, slug: true, name: true },
    });
    const businessIds = demoBusinesses.map((business) => business.id);
    if (!businessIds.length) {
      return { businesses: 0, deleted: {} };
    }

    const demoOrders = await tx.order.findMany({
      where: {
        businessId: { in: businessIds },
        OR: [
          { orderNumber: { in: DEMO_ORDER_NUMBERS } },
          { statusHistory: { some: { note: { contains: 'Demo' } } } },
          { workflowHistory: { some: { note: { contains: 'Demo' } } } },
        ],
      },
      select: { id: true, businessId: true, customerId: true, orderNumber: true },
    });
    const orderIds = demoOrders.map((order) => order.id);

    const demoCustomers = await tx.customer.findMany({
      where: {
        businessId: { in: businessIds },
        OR: [
          { phoneNormalized: { in: DEMO_PHONE_NORMALIZED } },
          { name: { startsWith: 'Demo ' } },
          { name: 'Repeat Demo Customer' },
          { notes: { contains: 'demo', mode: 'insensitive' } },
          { id: { in: demoOrders.map((order) => order.customerId) } },
        ],
      },
      select: { id: true, businessId: true, name: true, phoneNormalized: true },
    });
    const customerIds = [...new Set(demoCustomers.map((customer) => customer.id))];

    const paymentsByKey = await tx.payment.deleteMany({
      where: {
        businessId: { in: businessIds },
        OR: [
          { idempotencyKey: { in: DEMO_PAYMENT_KEYS } },
          { idempotencyKey: { startsWith: 'demo-payment-' } },
          { orderId: { in: orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'] } },
        ],
      },
    });

    const whatsapp = await tx.whatsAppNotification.deleteMany({
      where: {
        businessId: { in: businessIds },
        OR: [
          ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
          ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
        ],
      },
    });

    const alterations = orderIds.length
      ? await tx.alterationTask.deleteMany({ where: { orderId: { in: orderIds } } })
      : { count: 0 };

    const orderCustom = orderIds.length
      ? await tx.customFieldValue.deleteMany({
        where: {
          businessId: { in: businessIds },
          OR: [
            { orderId: { in: orderIds } },
            { orderItem: { orderId: { in: orderIds } } },
          ],
        },
      })
      : { count: 0 };

    const customerCustom = customerIds.length
      ? await tx.customFieldValue.deleteMany({
        where: { businessId: { in: businessIds }, customerId: { in: customerIds } },
      })
      : { count: 0 };

    const workflowHistory = orderIds.length
      ? await tx.orderWorkflowHistory.deleteMany({
        where: { businessId: { in: businessIds }, orderId: { in: orderIds } },
      })
      : { count: 0 };

    const statusHistory = orderIds.length
      ? await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } })
      : { count: 0 };

    const orderItems = orderIds.length
      ? await tx.orderItem.deleteMany({
        where: { businessId: { in: businessIds }, orderId: { in: orderIds } },
      })
      : { count: 0 };

    const orders = orderIds.length
      ? await tx.order.deleteMany({
        where: { businessId: { in: businessIds }, id: { in: orderIds } },
      })
      : { count: 0 };

    const profiles = customerIds.length
      ? await tx.measurementProfile.findMany({
        where: { businessId: { in: businessIds }, customerId: { in: customerIds } },
        select: { id: true },
      })
      : [];
    const profileIds = profiles.map((profile) => profile.id);
    const revisions = profileIds.length
      ? await tx.measurementRevision.deleteMany({ where: { profileId: { in: profileIds } } })
      : { count: 0 };
    const measurementProfiles = profileIds.length
      ? await tx.measurementProfile.deleteMany({
        where: { businessId: { in: businessIds }, id: { in: profileIds } },
      })
      : { count: 0 };

    const customers = customerIds.length
      ? await tx.customer.deleteMany({
        where: { businessId: { in: businessIds }, id: { in: customerIds } },
      })
      : { count: 0 };

    // Keep sequence counters usable for the first real order the user creates.
    await tx.business.updateMany({
      where: { id: { in: businessIds }, orderSequence: { gt: 0 } },
      data: { orderSequence: 0 },
    });
    await tx.business.updateMany({
      where: { id: { in: businessIds }, receiptSequence: { gt: 0 } },
      data: { receiptSequence: 0 },
    });

    return {
      businesses: demoBusinesses.map((business) => ({ slug: business.slug, name: business.name })),
      deleted: {
        payments: paymentsByKey.count,
        whatsappNotifications: whatsapp.count,
        alterations: alterations.count,
        orderCustomFields: orderCustom.count,
        customerCustomFields: customerCustom.count,
        workflowHistory: workflowHistory.count,
        statusHistory: statusHistory.count,
        orderItems: orderItems.count,
        orders: orders.count,
        measurementRevisions: revisions.count,
        measurementProfiles: measurementProfiles.count,
        customers: customers.count,
      },
      orderNumbers: demoOrders.map((order) => order.orderNumber),
      customers: demoCustomers.map((customer) => ({
        name: customer.name,
        phoneNormalized: customer.phoneNormalized,
      })),
    };
  }, { maxWait: 20_000, timeout: 120_000 });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
