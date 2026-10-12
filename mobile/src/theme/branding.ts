/**
 * Branding loader. Re-exports the public branding fetch from the api
 * module so the theme can use it without pulling in the rest of api.ts.
 */
import { API_BASE_URL, fetchApplicationBranding as fetchApplicationBrandingFromApi, parseBusinessConfiguration } from '../api';

export function resolveBrandAssetUrl(value: string): string {
  if (!value.startsWith('/')) return value;
  try {
    return new URL(value, `${new URL(API_BASE_URL).origin}/`).toString();
  } catch {
    return value;
  }
}

export const fetchApplicationBranding = fetchApplicationBrandingFromApi;

// Re-export for screens that want to do their own branding lookups.
export { parseBusinessConfiguration };
