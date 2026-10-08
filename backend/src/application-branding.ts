import {
  applicationBrandingSchema,
  DEFAULT_APPLICATION_BRANDING,
  type ApplicationBranding,
} from '@tailor/shared';
import { prisma } from './db.js';

export const APPLICATION_BRANDING_SETTING_KEY = 'application-branding';

/**
 * Product appearance is stored in the existing platform settings table. Invalid
 * legacy values are ignored so a bad setting cannot prevent the app from loading.
 */
export async function loadApplicationBranding(): Promise<ApplicationBranding> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: APPLICATION_BRANDING_SETTING_KEY },
    select: { value: true },
  });
  const parsed = applicationBrandingSchema.safeParse(setting?.value);
  return parsed.success ? parsed.data : DEFAULT_APPLICATION_BRANDING;
}
