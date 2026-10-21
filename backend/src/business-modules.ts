import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { HttpError } from './errors.js';
import { cachedPolicy } from './policy-cache.js';
import {
  resolveEffectiveBusinessModules,
  resolvePlatformEnabledModules,
} from './business-module-policy.js';

export {
  moduleForBusinessPermission,
  resolveEffectiveBusinessModules,
  resolvePlatformEnabledModules,
} from './business-module-policy.js';

/** Reserved setting key written only by platform business administrators. */
export const PLATFORM_ENABLED_MODULES_SETTING_KEY = 'platform_enabled_modules';

// The four lookups below are plain scalar reads; typing the client by the models
// they touch lets the same function run on the shared client or a transaction.
type BusinessModuleClient = Pick<
  Prisma.TransactionClient,
  'business' | 'businessSetting' | 'businessTemplate' | 'businessConfiguration'
>;

export interface BusinessModuleAccess {
  templateModules: string[];
  platformEnabledModules: string[];
  enabledModules: string[];
}

// A single request resolves module access several times (permission middleware
// plus the route handler). Memoizing the promise per request collapses those
// duplicates into one lookup without any cross-request staleness.
const requestModuleAccess = new WeakMap<object, Map<string, Promise<BusinessModuleAccess>>>();

function requestMemo(
  cacheScope: object | undefined,
  client: unknown,
  businessId: string,
): Map<string, Promise<BusinessModuleAccess>> | undefined {
  // Only memoize lookups on the shared client; transaction snapshots must
  // always read their own state.
  if (!cacheScope || client !== prisma) return undefined;
  let entries = requestModuleAccess.get(cacheScope);
  if (!entries) {
    entries = new Map();
    requestModuleAccess.set(cacheScope, entries);
  }
  return entries;
}

export async function resolveBusinessModuleAccess(
  client: BusinessModuleClient,
  businessId: string,
  cacheScope?: object,
): Promise<BusinessModuleAccess> {
  const memo = requestMemo(cacheScope, client, businessId);
  const cached = memo?.get(businessId);
  if (cached) return cached;

  // Shared-client lookups also use the cross-request policy cache; transaction
  // clients must read their own snapshot and stay uncached.
  const pending = client === prisma
    ? cachedPolicy(`module-access:${businessId}`, () => loadBusinessModuleAccess(client, businessId))
    : loadBusinessModuleAccess(client, businessId);
  memo?.set(businessId, pending);
  try {
    return await pending;
  } catch (error) {
    memo?.delete(businessId);
    throw error;
  }
}

async function loadBusinessModuleAccess(
  client: BusinessModuleClient,
  businessId: string,
): Promise<BusinessModuleAccess> {
  // Four independent lookups: run them concurrently so one HTTP request pays
  // for a single database round trip instead of four sequential ones.
  const [business, template, configuration, moduleSetting] = await Promise.all([
    client.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    }),
    client.businessTemplate.findFirst({
      where: { businesses: { some: { id: businessId } } },
      select: { enabledModules: true },
    }),
    client.businessConfiguration.findUnique({
      where: { businessId },
      select: { enabledModules: true },
    }),
    client.businessSetting.findUnique({
      where: { businessId_key: { businessId, key: PLATFORM_ENABLED_MODULES_SETTING_KEY } },
      select: { value: true },
    }),
  ]);
  if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  if (!template) throw new HttpError(409, 'Business has no assigned template', 'BUSINESS_TEMPLATE_MISSING');

  const templateModules = template.enabledModules;
  const platformEnabledModules = resolvePlatformEnabledModules(
    templateModules,
    moduleSetting?.value,
    moduleSetting !== null,
  );
  const tenantModules = configuration?.enabledModules ?? templateModules;

  return {
    templateModules,
    platformEnabledModules,
    enabledModules: resolveEffectiveBusinessModules(templateModules, tenantModules, platformEnabledModules),
  };
}

export async function assertBusinessModuleEnabled(
  businessId: string,
  module: string,
  cacheScope?: object,
): Promise<void> {
  const access = await resolveBusinessModuleAccess(prisma, businessId, cacheScope);
  if (!access.enabledModules.includes(module)) {
    throw new HttpError(403, `The ${module} module is disabled for this business`, 'BUSINESS_MODULE_DISABLED');
  }
}
