import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { HttpError } from './errors.js';
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

type BusinessModuleClient = Pick<Prisma.TransactionClient, 'business' | 'businessSetting'>;

export async function resolveBusinessModuleAccess(
  client: BusinessModuleClient,
  businessId: string,
): Promise<{
  templateModules: string[];
  platformEnabledModules: string[];
  enabledModules: string[];
}> {
  const [business, moduleSetting] = await Promise.all([
    client.business.findUnique({
      where: { id: businessId },
      select: {
        template: { select: { enabledModules: true } },
        configuration: { select: { enabledModules: true } },
      },
    }),
    client.businessSetting.findUnique({
      where: { businessId_key: { businessId, key: PLATFORM_ENABLED_MODULES_SETTING_KEY } },
      select: { value: true },
    }),
  ]);

  if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  if (!business.template) throw new HttpError(409, 'Business has no assigned template', 'BUSINESS_TEMPLATE_MISSING');

  const templateModules = business.template.enabledModules;
  const platformEnabledModules = resolvePlatformEnabledModules(
    templateModules,
    moduleSetting?.value,
    moduleSetting !== null,
  );
  const tenantModules = business.configuration?.enabledModules ?? templateModules;

  return {
    templateModules,
    platformEnabledModules,
    enabledModules: resolveEffectiveBusinessModules(templateModules, tenantModules, platformEnabledModules),
  };
}

export async function assertBusinessModuleEnabled(businessId: string, module: string): Promise<void> {
  const access = await resolveBusinessModuleAccess(prisma, businessId);
  if (!access.enabledModules.includes(module)) {
    throw new HttpError(403, `The ${module} module is disabled for this business`, 'BUSINESS_MODULE_DISABLED');
  }
}
