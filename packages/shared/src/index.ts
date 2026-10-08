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
