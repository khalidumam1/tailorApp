import { Prisma } from '@prisma/client';
import { HttpError } from './errors.js';

type UsageLimit = 'customers' | 'staff' | 'ordersPerMonth';

const permissionLimit: Record<string, UsageLimit | undefined> = {
  'customers:write': 'customers',
  'staff:manage': 'staff',
  'orders:write': 'ordersPerMonth',
};

export async function assertPlanLimit(
  tx: Prisma.TransactionClient,
  businessId: string,
  permission: string,
  additionalUsage = 1,
): Promise<void> {
  const limitName = permissionLimit[permission];
  if (!limitName || additionalUsage <= 0) return;

  await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${businessId}::uuid FOR UPDATE`;
  const setting = await tx.platformSetting.findUnique({ where: { key: 'billing' }, select: { value: true } });
  const billing = setting?.value;
  const enforcementEnabled = typeof billing === 'object' && billing !== null
    && 'enforcementEnabled' in billing && billing.enforcementEnabled === true;
  if (!enforcementEnabled) return;

  const now = new Date();
  const entitlement = await tx.subscription.findFirst({
    where: {
      businessId,
      status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED'] },
      startsAt: { lte: now },
      graceUntil: { gt: now },
    },
    orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
    include: { plan: { select: { limits: true } } },
  });
  if (!entitlement) {
    throw new HttpError(402, 'Your subscription has expired. Submit a renewal payment to restore paid features.', 'SUBSCRIPTION_REQUIRED');
  }
  const limits = entitlement.plan.limits;
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits) || !(limitName in limits)) return;
  const limit = limits[limitName];
  if (typeof limit !== 'number' || limit < 0) return;

  let currentUsage: number;
  if (limitName === 'customers') {
    currentUsage = await tx.customer.count({ where: { businessId, deletedAt: null } });
  } else if (limitName === 'staff') {
    currentUsage = await tx.membership.count({
      where: { businessId, active: true, role: { name: { not: 'Owner' } } },
    });
  } else {
    const karachiNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(karachiNow.getUTCFullYear(), karachiNow.getUTCMonth(), 1) - 5 * 60 * 60 * 1000);
    currentUsage = await tx.order.count({ where: { businessId, createdAt: { gte: monthStart } } });
  }
  if (currentUsage + additionalUsage > limit) {
    throw new HttpError(403, `Your plan limit for ${limitName} has been reached.`, 'SUBSCRIPTION_LIMIT_REACHED');
  }
}
