import { z } from 'zod';
import {
  createCustomerSchema,
  createMeasurementRevisionSchema,
  createOrderSchema,
  createPaymentSchema,
  orderStatuses,
} from '@tailor/shared';

const customerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  whatsappConsent: z.boolean(),
  whatsappConsentAt: z.string().nullable(),
  whatsappOptedOutAt: z.string().nullable(),
  notes: z.string().nullable().optional(),
  version: z.number().int(),
  createdAt: z.string(),
});

const customerSummarySchema = customerSchema.pick({ id: true, name: true, phone: true });
const orderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  status: z.enum(orderStatuses),
  version: z.number().int(),
  total: z.string(),
  paid: z.string(),
  outstanding: z.string(),
  promisedAt: z.string(),
  createdAt: z.string(),
  customer: customerSummarySchema,
  items: z.array(z.object({
    id: z.string().uuid(),
    garmentName: z.string(),
    quantity: z.number().int(),
    unitPrice: z.string(),
    measurementSnapshot: z.record(z.string(), z.unknown()),
  })),
});

const loginResponseSchema = z.union([
  z.object({
    user: z.object({ id: z.string().uuid(), name: z.string(), email: z.string(), platformRole: z.string().nullable().optional() }),
    business: z.object({ id: z.string().uuid(), name: z.string() }).optional(),
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
  z.object({
    requiresScopeSelection: z.literal(true),
    canAccessPlatform: z.boolean(),
    businesses: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  }),
  z.object({
    requiresBusinessSelection: z.literal(true),
    businesses: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  }),
]);

const meSchema = z.object({
  user: z.object({ id: z.string().uuid(), name: z.string(), email: z.string(), platformRole: z.string().nullable() }),
  context: z.object({
    scope: z.enum(['business', 'platform']),
    business: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), timezone: z.string() }).optional(),
    permissions: z.array(z.string()),
    platformPermissions: z.array(z.string()),
  }),
});

const dashboardSchema = z.object({
  newOrders: z.number().int(),
  dueToday: z.number().int(),
  overdue: z.number().int(),
  inProgress: z.number().int(),
  alterations: z.number().int(),
  outstanding: z.string().optional(),
  collectedToday: z.string().optional(),
  asOf: z.string(),
});

const refreshedSessionSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });

const templateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    unit: z.string(),
    required: z.boolean().optional(),
  })),
});

const profileSchema = z.object({
  id: z.string().uuid(),
  garmentTemplate: templateSchema.pick({ id: true, name: true, fields: true }),
  revisions: z.array(z.object({
    id: z.string().uuid(),
    version: z.number().int(),
    values: z.record(z.string(), z.unknown()),
    notes: z.string().nullable(),
    measuredAt: z.string(),
  })),
});

const paymentSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.string(),
  amount: z.string(),
  method: z.enum(['CASH', 'BANK', 'DIGITAL']),
  kind: z.enum(['PAYMENT', 'REVERSAL']),
  createdAt: z.string(),
  order: z.object({
    id: z.string().uuid(),
    orderNumber: z.string(),
    customer: customerSummarySchema,
  }),
});

const notificationSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  orderId: z.string().uuid(),
  paymentId: z.string().uuid().nullable(),
  kind: z.enum(['ORDER_CREATED', 'PAYMENT_RECEIVED', 'ORDER_READY']),
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NOT_SENT']),
  recipientPhone: z.string(),
  templateName: z.string(),
  attemptCount: z.number().int(),
  lastError: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const receiptSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.string(),
  amount: z.string(),
  method: z.enum(['CASH', 'BANK', 'DIGITAL']),
  kind: z.enum(['PAYMENT', 'REVERSAL']),
  createdAt: z.string(),
  business: z.object({ name: z.string(), timezone: z.string(), currency: z.string() }),
  order: z.object({
    orderNumber: z.string(),
    customer: z.object({ name: z.string(), phone: z.string() }),
  }),
  correctionOf: z.object({ receiptNumber: z.string() }).nullable(),
});

const platformBusinessSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
  createdAt: z.string(),
  _count: z.object({ memberships: z.number().int() }).optional(),
});

const platformStaffSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  active: z.boolean(),
  permissions: z.array(z.string()),
});

const platformPermissionSchema = z.object({ key: z.string(), description: z.string() });
const auditEventSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid().nullable(),
  actorId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  requestId: z.string(),
  createdAt: z.string(),
  actor: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }).nullable(),
});

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type Customer = z.infer<typeof customerSchema>;
export type Order = z.infer<typeof orderSchema>;
export type LoginResult = z.infer<typeof loginResponseSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type GarmentTemplate = z.infer<typeof templateSchema>;
export type MeasurementProfile = z.infer<typeof profileSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type WhatsAppNotification = z.infer<typeof notificationSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type PlatformBusiness = z.infer<typeof platformBusinessSchema>;
export type PlatformStaff = z.infer<typeof platformStaffSchema>;
export type PlatformPermission = z.infer<typeof platformPermissionSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type Session = Extract<LoginResult, { accessToken: string }>;
export type CurrentUser = z.infer<typeof meSchema>;
export type CustomerInput = z.infer<typeof createCustomerSchema>;
export type OrderInput = z.infer<typeof createOrderSchema>;

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiBaseUrl = import.meta.env.API_BASE_URL;

async function request<T>(
  route: string,
  schema: z.ZodType<T>,
  options: { token?: string; method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers({ accept: 'application/json' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  const response = await fetch(`${apiBaseUrl}/api/v1${route}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'omit',
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = errorSchema.safeParse(payload);
    throw new ApiError(
      error.success ? error.data.error.message : `Request failed (${response.status})`,
      error.success ? error.data.error.code : 'REQUEST_FAILED',
      response.status,
    );
  }
  return schema.parse(z.object({ data: z.unknown() }).parse(payload).data);
}

export const api = {
  login(email: string, password: string, scope?: 'business' | 'platform', businessId?: string) {
    return request('/auth/login', loginResponseSchema, {
      method: 'POST',
      body: { email, password, ...(scope ? { scope } : {}), ...(businessId ? { businessId } : {}) },
    });
  },
  logout(token: string, refreshToken: string) {
    return request('/auth/logout', z.object({ revoked: z.boolean() }), {
      token,
      method: 'POST',
      body: { refreshToken },
    });
  },
  me(token: string) {
    return request('/auth/me', meSchema, { token });
  },
  refresh(refreshToken: string) {
    return request('/auth/refresh', refreshedSessionSchema, { method: 'POST', body: { refreshToken } });
  },
  dashboard(token: string) {
    return request('/reports/dashboard', dashboardSchema, { token });
  },
  customers(token: string, query = '') {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('q', query);
    return request(`/customers?${params}`, z.object({ items: z.array(customerSchema), nextCursor: z.string().nullable() }), { token });
  },
  createCustomer(token: string, input: CustomerInput) {
    return request('/customers', customerSchema, { token, method: 'POST', body: input });
  },
  setWhatsAppConsent(token: string, customer: Customer, consented: boolean) {
    return request(`/customers/${customer.id}/whatsapp-consent`, customerSchema, {
      token,
      method: 'POST',
      body: { consented, version: customer.version },
    });
  },
  notifications(token: string) {
    return request('/notifications?limit=100', z.object({
      items: z.array(notificationSchema),
      nextCursor: z.string().nullable(),
    }), { token });
  },
  orders(token: string, query = '') {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('q', query);
    return request(`/orders?${params}`, z.object({ items: z.array(orderSchema), nextCursor: z.string().nullable() }), { token });
  },
  createOrder(token: string, input: OrderInput) {
    return request('/orders', orderSchema.omit({ paid: true, outstanding: true }), {
      token,
      method: 'POST',
      body: input,
    });
  },
  transitionOrder(token: string, order: Order, toStatus: Order['status']) {
    return request(`/orders/${order.id}/status`, orderSchema.omit({ paid: true, outstanding: true }).partial(), {
      token,
      method: 'POST',
      body: { toStatus, version: order.version },
    });
  },
  templates(token: string) {
    return request('/measurements/templates', z.object({ items: z.array(templateSchema) }), { token });
  },
  measurements(token: string, customerId: string) {
    return request(`/measurements/customers/${customerId}`, z.object({ items: z.array(profileSchema) }), { token });
  },
  createMeasurement(token: string, customerId: string, input: z.infer<typeof createMeasurementRevisionSchema>) {
    return request(`/measurements/customers/${customerId}/revisions`, z.object({
      profile: z.object({ id: z.string().uuid() }),
      revision: profileSchema.shape.revisions.element,
    }), { token, method: 'POST', body: input });
  },
  payments(token: string) {
    return request('/payments?limit=100', z.object({ items: z.array(paymentSchema), nextCursor: z.string().nullable() }), { token });
  },
  createPayment(token: string, orderId: string, input: z.infer<typeof createPaymentSchema>, idempotencyKey: string) {
    return request(`/payments/orders/${orderId}`, paymentSchema.omit({ order: true }), {
      token,
      method: 'POST',
      body: input,
      idempotencyKey,
    });
  },
  receipt(token: string, paymentId: string) {
    return request(`/payments/${paymentId}/receipt`, receiptSchema, { token });
  },
  platformBusinesses(token: string) {
    return request('/platform/businesses?limit=100', z.object({
      items: z.array(platformBusinessSchema),
      nextCursor: z.string().nullable(),
    }), { token });
  },
  createPlatformBusiness(token: string, input: { name: string; slug: string }) {
    return request('/platform/businesses', platformBusinessSchema, { token, method: 'POST', body: input });
  },
  assignBusinessOwner(token: string, businessId: string, input: { name: string; email: string; initialPassword: string }) {
    return request(`/platform/businesses/${businessId}/owners`, z.object({
      business: z.object({ id: z.string().uuid(), name: z.string() }),
      owner: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }),
      membershipId: z.string().uuid(),
      accountCreated: z.boolean(),
    }), { token, method: 'POST', body: input });
  },
  setBusinessStatus(token: string, businessId: string, status: PlatformBusiness['status']) {
    return request(`/platform/businesses/${businessId}/status`, platformBusinessSchema, {
      token,
      method: 'PATCH',
      body: { status },
    });
  },
  platformStaff(token: string) {
    return request('/platform/staff', z.object({ items: z.array(platformStaffSchema) }), { token });
  },
  platformPermissions(token: string) {
    return request('/platform/permissions', z.object({ items: z.array(platformPermissionSchema) }), { token });
  },
  createPlatformStaff(token: string, input: { name: string; email: string; password: string; permissions: string[] }) {
    return request('/platform/staff', platformStaffSchema, { token, method: 'POST', body: input });
  },
  updatePlatformStaff(token: string, staffId: string, input: { permissions: string[]; active?: boolean }) {
    return request(`/platform/staff/${staffId}/permissions`, platformStaffSchema, { token, method: 'PATCH', body: input });
  },
  platformHealth(token: string) {
    return request('/platform/health', z.object({
      status: z.string(),
      database: z.string(),
      checkedAt: z.string(),
    }), { token });
  },
  auditEvents(token: string) {
    return request('/audit?limit=100', z.object({
      items: z.array(auditEventSchema),
      nextCursor: z.string().nullable(),
    }), { token });
  },
};
