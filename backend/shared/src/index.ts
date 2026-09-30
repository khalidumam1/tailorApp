import { z } from 'zod';
export { normalizePakistanPhone } from './phone.js';

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
  phone: z.string().trim().min(7).max(24).regex(/^\+?[0-9][0-9\s().-]*$/),
  notes: z.string().trim().max(2000).optional(),
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
  items: z.array(z.object({
    garmentName: z.string().trim().min(1).max(120),
    quantity: z.number().int().min(1).max(100),
    unitPrice: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).refine((amount) => Number(amount) > 0),
    measurementProfileId: z.string().uuid().optional(),
  })).min(1).max(20),
});

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
  entityType: z.enum(['customer', 'measurement', 'order']),
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
