import { z } from 'zod';
import { toE164Phone } from './phone.js';
export { normalizePakistanPhone, toE164Phone } from './phone.js';

export const orderStatuses = [
  'NEW',
  'MEASUREMENT_CONFIRMED',
  'CUTTING',
  'STITCHING',
  'FINISHING',
  'READY_FOR_PICKUP',
  'COLLECTED',
  'CANCELLED',
] as const;

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(24).regex(/^\+?[0-9][0-9\s().-]*$/)
    .refine((phone) => {
      try {
        toE164Phone(phone);
        return true;
      } catch {
        return false;
      }
    }, 'Phone number must be valid in international format'),
  notes: z.string().trim().max(2000).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  version: z.number().int().positive(),
}).refine((input) => Object.keys(input).some((key) => key !== 'version'), {
  message: 'At least one customer field must be provided',
});

export const customerQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const createMeasurementRevisionSchema = z.object({
  garmentTemplateId: z.string().uuid(),
  values: z.record(z.string(), z.union([z.string().trim().max(120), z.number().finite()])),
  notes: z.string().trim().max(2000).optional(),
  measuredAt: z.string().datetime({ offset: true }),
});

export const garmentTemplateFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(16),
  required: z.boolean().default(false),
});

export const createGarmentTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  fields: z.array(garmentTemplateFieldSchema).min(1).max(100),
});

export const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  promisedAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(4000).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  items: z.array(z.object({
    itemTypeKey: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/).optional(),
    itemName: z.string().trim().min(1).max(160).optional(),
    garmentName: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(100),
    unitPrice: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).refine((amount) => Number(amount) > 0),
    measurementProfileId: z.string().uuid().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  }).refine((item) => Boolean(item.itemName || item.garmentName), {
    message: 'An item name is required',
  })).min(1).max(20),
}).strict();

export const createPaymentSchema = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/).refine((amount) => Number(amount) > 0),
  method: z.enum(['CASH', 'BANK', 'DIGITAL']),
  financialAccountId: z.string().uuid().optional(),
});

export const orderQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(orderStatuses).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const transitionOrderSchema = z.object({
  toStatus: z.enum(orderStatuses),
  version: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

export const transitionWorkflowSchema = z.object({
  toStageKey: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/),
  version: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
}).strict();

export const createAlterationSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  dueAt: z.string().datetime({ offset: true }).optional(),
});

export const reversePaymentSchema = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/).refine((amount) => Number(amount) > 0),
  reason: z.string().trim().min(1).max(500),
});

export const paymentQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const syncOperationSchema = z.object({
  clientOperationId: z.string().uuid(),
  entityType: z.enum(['customer', 'measurement', 'order', 'catalog_item']),
  entityId: z.string().uuid(),
  baseVersion: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type OrderStatus = (typeof orderStatuses)[number];
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateMeasurementRevisionInput = z.infer<typeof createMeasurementRevisionSchema>;
export type CreateGarmentTemplateInput = z.infer<typeof createGarmentTemplateSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type SyncOperationInput = z.infer<typeof syncOperationSchema>;

const brandingAssetUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, 'Use an HTTPS URL or a same-origin absolute path');

const supportUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, 'Support links must use HTTPS');

export const applicationBrandingSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(140),
  description: z.string().trim().max(320),
  loginTitle: z.string().trim().max(120),
  logoUrl: brandingAssetUrlSchema,
  faviconUrl: brandingAssetUrlSchema,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  defaultTheme: z.enum(['light', 'dark']),
  supportEmail: z.string().trim().max(254).refine((value) => !value || z.string().email().safeParse(value).success,
    'Support email must be a valid email address'),
  supportUrl: supportUrlSchema,
  footerText: z.string().trim().max(200),
}).strict();

export type ApplicationBranding = z.infer<typeof applicationBrandingSchema>;

export const DEFAULT_APPLICATION_BRANDING: ApplicationBranding = {
  brandName: 'TailorApp',
  tagline: 'Made for the workroom',
  description: 'Keep customers, measurements, stitching progress and payments in one clear place.',
  loginTitle: 'Good work starts with a good fit.',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#117a5c',
  accentColor: '#c08a33',
  defaultTheme: 'light',
  supportEmail: '',
  supportUrl: '',
  footerText: '',
};

/** Return the higher-contrast of white and deep ink for text on a configured brand fill. */
export function accessibleTextColor(hexColor: string): '#ffffff' | '#0e1a16' {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hexColor) ? hexColor.slice(1) : '117a5c';
  const channels = [0, 2, 4].map((index) => {
    const value = Number.parseInt(normalized.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithInk = (luminance + 0.05) / (0.008 + 0.05);
  return contrastWithWhite >= contrastWithInk ? '#ffffff' : '#0e1a16';
}

export const LOGO_STYLE_KEYS = ['shears', 'crest', 'mannequin', 'grid', 'monogram'] as const;
export type LogoStyleKey = (typeof LOGO_STYLE_KEYS)[number];

export const LOGO_SHAPE_KEYS = ['rounded', 'circle', 'shield', 'minimal'] as const;
export type LogoShapeKey = (typeof LOGO_SHAPE_KEYS)[number];

export interface ConfigurableLogoOptions {
  style: LogoStyleKey;
  shape: LogoShapeKey;
  monogram: string;
  primaryColor: string;
  accentColor: string;
  showStitchRing: boolean;
}

export const BRAND_LOGO_PRESETS: ReadonlyArray<{
  key: LogoStyleKey;
  label: string;
  description: string;
}> = [
  {
    key: 'shears',
    label: 'Tailor Shears',
    description: 'Precision cutting shears with a golden stitch arc',
  },
  {
    key: 'crest',
    label: 'Atelier Spool & Needle',
    description: 'Thread spool crossed by a bespoke sewing needle',
  },
  {
    key: 'mannequin',
    label: 'Bespoke Dress Form',
    description: 'Workroom dress form with tailored lapel & waist tape',
  },
  {
    key: 'grid',
    label: 'Workroom Ledger',
    description: 'Modern management grid with operations & order bar',
  },
  {
    key: 'monogram',
    label: 'Monogram Crest',
    description: 'Stitched badge featuring your custom brand initials',
  },
] as const;

export const BRAND_LOGO_SHAPES: ReadonlyArray<{
  key: LogoShapeKey;
  label: string;
}> = [
  { key: 'rounded', label: 'Rounded Square' },
  { key: 'circle', label: 'Circle Medallion' },
  { key: 'shield', label: 'Atelier Shield' },
  { key: 'minimal', label: 'Framed Outline' },
] as const;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeBrandHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function brandInitials(name: string | null | undefined, maxChars = 2): string {
  const cleaned = (name ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9\s]+/g, ' ')
    .trim();
  if (!cleaned) return 'TA';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, maxChars)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }
  const single = words[0];
  const camelCaps = single.replace(/[^A-Z0-9]/g, '');
  if (camelCaps.length >= 2) return camelCaps.slice(0, maxChars);
  return single.slice(0, maxChars).toUpperCase();
}

export function sanitizeLogoMonogram(value: string | null | undefined, fallbackName = 'TailorApp'): string {
  const cleaned = (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9&+]/g, '')
    .slice(0, 3);
  return cleaned || brandInitials(fallbackName, 2);
}

export function isLogoStyleKey(value: string | null | undefined): value is LogoStyleKey {
  return Boolean(value && (LOGO_STYLE_KEYS as readonly string[]).includes(value));
}

export function isLogoShapeKey(value: string | null | undefined): value is LogoShapeKey {
  return Boolean(value && (LOGO_SHAPE_KEYS as readonly string[]).includes(value));
}

export function buildConfigurableLogoUrl(options: Partial<ConfigurableLogoOptions>): string {
  const style: LogoStyleKey = isLogoStyleKey(options.style) ? options.style : 'shears';
  const shape: LogoShapeKey = isLogoShapeKey(options.shape) ? options.shape : 'rounded';
  const primaryColor = normalizeBrandHexColor(options.primaryColor, DEFAULT_APPLICATION_BRANDING.primaryColor);
  const accentColor = normalizeBrandHexColor(options.accentColor, DEFAULT_APPLICATION_BRANDING.accentColor);
  const showStitchRing = options.showStitchRing ?? true;
  const monogram = (options.monogram ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9&+]/g, '')
    .slice(0, 3);

  const params = new URLSearchParams();
  params.set('shape', shape);
  params.set('primary', primaryColor);
  params.set('accent', accentColor);
  params.set('stitch', showStitchRing ? '1' : '0');
  if (monogram) params.set('text', monogram);
  return `/logos/${style}.svg?${params.toString()}`;
}

export function parseConfigurableLogoUrl(
  logoUrl: string | null | undefined,
  defaults?: Partial<ConfigurableLogoOptions> & { fallbackName?: string },
): ConfigurableLogoOptions & { isConfigurablePreset: boolean } {
  const fallbackName = defaults?.fallbackName ?? DEFAULT_APPLICATION_BRANDING.brandName;
  const base: ConfigurableLogoOptions = {
    style: isLogoStyleKey(defaults?.style) ? defaults.style : 'shears',
    shape: isLogoShapeKey(defaults?.shape) ? defaults.shape : 'rounded',
    monogram: sanitizeLogoMonogram(defaults?.monogram, fallbackName),
    primaryColor: normalizeBrandHexColor(defaults?.primaryColor, DEFAULT_APPLICATION_BRANDING.primaryColor),
    accentColor: normalizeBrandHexColor(defaults?.accentColor, DEFAULT_APPLICATION_BRANDING.accentColor),
    showStitchRing: defaults?.showStitchRing ?? true,
  };

  const trimmed = (logoUrl ?? '').trim();
  if (!trimmed) {
    return { ...base, isConfigurablePreset: true };
  }

  let pathname = '';
  let searchParams: URLSearchParams | null = null;
  try {
    const parsed = trimmed.startsWith('/')
      ? new URL(trimmed, 'https://tailor.local')
      : new URL(trimmed);
    pathname = parsed.pathname;
    searchParams = parsed.searchParams;
  } catch {
    return { ...base, isConfigurablePreset: false };
  }

  const presetMatch = /^\/(?:logos\/([a-z0-9-]+)\.svg|(?:backend\/)?api\/v1\/public\/logo\.svg|favicon\.svg)$/i.exec(pathname);
  if (!presetMatch) {
    return { ...base, isConfigurablePreset: false };
  }

  const pathStyle = presetMatch[1]?.toLowerCase();
  const queryStyle = searchParams?.get('style')?.toLowerCase();
  const style: LogoStyleKey = isLogoStyleKey(pathStyle)
    ? pathStyle
    : isLogoStyleKey(queryStyle)
      ? queryStyle
      : base.style;
  const queryShape = searchParams?.get('shape')?.toLowerCase();
  const shape: LogoShapeKey = isLogoShapeKey(queryShape) ? queryShape : base.shape;
  const primaryColor = normalizeBrandHexColor(searchParams?.get('primary'), base.primaryColor);
  const accentColor = normalizeBrandHexColor(searchParams?.get('accent'), base.accentColor);
  const stitchParam = searchParams?.get('stitch');
  const showStitchRing = stitchParam === null ? base.showStitchRing : stitchParam !== '0' && stitchParam !== 'false';
  const textParam = searchParams?.get('text');
  const monogram = textParam ? sanitizeLogoMonogram(textParam, fallbackName) : base.monogram;

  return {
    style,
    shape,
    monogram,
    primaryColor,
    accentColor,
    showStitchRing,
    isConfigurablePreset: true,
  };
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderConfigurableLogoSvg(
  options: Partial<ConfigurableLogoOptions> = {},
  fallbackName = DEFAULT_APPLICATION_BRANDING.brandName,
): string {
  const style: LogoStyleKey = isLogoStyleKey(options.style) ? options.style : 'shears';
  const shape: LogoShapeKey = isLogoShapeKey(options.shape) ? options.shape : 'rounded';
  const primary = normalizeBrandHexColor(options.primaryColor, DEFAULT_APPLICATION_BRANDING.primaryColor);
  const accent = normalizeBrandHexColor(options.accentColor, DEFAULT_APPLICATION_BRANDING.accentColor);
  const fg = accessibleTextColor(primary);
  const showStitchRing = options.showStitchRing ?? true;
  const monogram = sanitizeLogoMonogram(options.monogram, fallbackName);

  let backgroundShape = '';
  let stitchOverlay = '';
  if (shape === 'circle') {
    backgroundShape = `<circle cx="32" cy="32" r="30.5" fill="url(#tl-bg)" stroke="${accent}" stroke-opacity="0.35" stroke-width="1"/>`;
    if (showStitchRing) {
      stitchOverlay = `<circle cx="32" cy="32" r="26.2" fill="none" stroke="${accent}" stroke-opacity="0.65" stroke-width="1.35" stroke-dasharray="3.4 2.8"/>`;
    }
  } else if (shape === 'shield') {
    backgroundShape = `<path d="M32 3.2 L56.5 11.2 V29.8 C56.5 46.2 45.8 56.4 32 60.8 C18.2 56.4 7.5 46.2 7.5 29.8 V11.2 Z" fill="url(#tl-bg)" stroke="${accent}" stroke-opacity="0.4" stroke-width="1.1"/>`;
    if (showStitchRing) {
      stitchOverlay = `<path d="M32 7.6 L52 14.2 V29.4 C52 43.1 43 51.8 32 55.7 C21 51.8 12 43.1 12 29.4 V14.2 Z" fill="none" stroke="${accent}" stroke-opacity="0.65" stroke-width="1.3" stroke-dasharray="3.2 2.6"/>`;
    }
  } else if (shape === 'minimal') {
    backgroundShape = `<rect x="2.5" y="2.5" width="59" height="59" rx="14" fill="url(#tl-bg)" stroke="${accent}" stroke-width="2.4"/>`;
    if (showStitchRing) {
      stitchOverlay = `<rect x="7" y="7" width="50" height="50" rx="10" fill="none" stroke="${fg}" stroke-opacity="0.28" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    }
  } else {
    backgroundShape = `<rect x="1.5" y="1.5" width="61" height="61" rx="15" fill="url(#tl-bg)" stroke="${accent}" stroke-opacity="0.32" stroke-width="1"/>`;
    if (showStitchRing) {
      stitchOverlay = `<rect x="6.2" y="6.2" width="51.6" height="51.6" rx="11.2" fill="none" stroke="${accent}" stroke-opacity="0.65" stroke-width="1.35" stroke-dasharray="3.5 2.8"/>`;
    }
  }

  let emblem = '';
  if (style === 'shears') {
    emblem = `
      <path d="M16 18.5 C24 12.2 40 12.2 48 18.5" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-dasharray="2.6 3.4"/>
      <path d="M23.5 38.5 L45.5 16.5 C46.8 18.8 46.2 21.8 43.8 24.2 L28.5 39.5 Z" fill="${fg}"/>
      <path d="M40.5 38.5 L18.5 16.5 C17.2 18.8 17.8 21.8 20.2 24.2 L35.5 39.5 Z" fill="${fg}" fill-opacity="0.92"/>
      <circle cx="21.5" cy="44" r="6" fill="none" stroke="${fg}" stroke-width="3.2"/>
      <circle cx="42.5" cy="44" r="6" fill="none" stroke="${accent}" stroke-width="3.2"/>
      <line x1="25.8" y1="39.5" x2="29.5" y2="34.5" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
      <line x1="38.2" y1="39.5" x2="34.5" y2="34.5" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="29.5" r="2.7" fill="${accent}" stroke="${primary}" stroke-width="1.1"/>
    `;
  } else if (style === 'crest') {
    emblem = `
      <rect x="21" y="16" width="22" height="4.5" rx="2.2" fill="${accent}"/>
      <rect x="21" y="43.5" width="22" height="4.5" rx="2.2" fill="${accent}"/>
      <rect x="24" y="20.5" width="16" height="23" rx="2" fill="${fg}" fill-opacity="0.92"/>
      <line x1="25.5" y1="25.5" x2="38.5" y2="25.5" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="25.5" y1="30" x2="38.5" y2="30" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="25.5" y1="34.5" x2="38.5" y2="34.5" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="25.5" y1="39" x2="38.5" y2="39" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="15" y1="47" x2="48" y2="14" stroke="${accent}" stroke-width="2.8" stroke-linecap="round"/>
      <ellipse cx="44.5" cy="17.5" rx="1.4" ry="2.6" transform="rotate(45 44.5 17.5)" fill="${primary}"/>
      <path d="M46 16 C52 22 50 32 42 36" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2.4 2.4"/>
    `;
  } else if (style === 'mannequin') {
    emblem = `
      <path d="M25 15 L32 23 L39 15 L45 19 C44 25 41 28.5 40 33 C42.5 37.5 44.5 42 44.5 45.5 H19.5 C19.5 42 21.5 37.5 24 33 C23 28.5 20 25 19 19 Z" fill="${fg}" fill-opacity="0.94"/>
      <path d="M26.5 16.5 L32 25.5 L37.5 16.5" fill="none" stroke="${primary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="32" y1="25.5" x2="32" y2="44.5" stroke="${primary}" stroke-width="1.6" stroke-dasharray="2.4 2.2"/>
      <rect x="23" y="31.2" width="18" height="3.4" rx="1.7" fill="${accent}"/>
      <line x1="32" y1="45.5" x2="32" y2="51.5" stroke="${accent}" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M24.5 51.5 H39.5" stroke="${accent}" stroke-width="2.8" stroke-linecap="round"/>
    `;
  } else if (style === 'grid') {
    emblem = `
      <rect x="14.5" y="15" width="15" height="15" rx="3.8" fill="${fg}"/>
      <rect x="33.5" y="15" width="16" height="9.5" rx="3.2" fill="${accent}"/>
      <rect x="33.5" y="27.5" width="16" height="12" rx="3.2" fill="${fg}" fill-opacity="0.88"/>
      <rect x="14.5" y="33" width="15" height="15.5" rx="3.8" fill="${fg}" fill-opacity="0.78"/>
      <rect x="33.5" y="42.5" width="16" height="6" rx="3" fill="${accent}"/>
      <path d="M18.8 22.6 L21.2 25 L26 19.8" fill="none" stroke="${primary}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  } else {
    const fontSize = monogram.length >= 3 ? 18 : monogram.length === 2 ? 22 : 26;
    emblem = `
      <polygon points="32,12 35,15.5 32,19 29,15.5" fill="${accent}"/>
      <text x="32" y="38.5" text-anchor="middle" fill="${fg}" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="0.8">${escapeSvgText(monogram)}</text>
      <line x1="17" y1="46.5" x2="47" y2="46.5" stroke="${accent}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="32" cy="46.5" r="2.2" fill="${fg}"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeSvgText(fallbackName)} logo"><defs><linearGradient id="tl-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${primary}" stop-opacity="0.9"/></linearGradient></defs>${backgroundShape}${stitchOverlay}${emblem}</svg>`.replace(/\s+/g, ' ').trim();
}

export function configurableLogoDataUri(
  options: Partial<ConfigurableLogoOptions> = {},
  fallbackName = DEFAULT_APPLICATION_BRANDING.brandName,
): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(renderConfigurableLogoSvg(options, fallbackName))}`;
}

