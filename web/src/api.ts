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
  customFields: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int(),
  createdAt: z.string(),
});

const customerSummarySchema = customerSchema.pick({ id: true, name: true, phone: true });
const catalogItemSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  typeKey: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  unit: z.string(),
  unitPrice: z.string().nullable(),
  sortOrder: z.number().int(),
  version: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  customFields: z.record(z.string(), z.unknown()),
});
const orderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  status: z.enum(orderStatuses),
  workflowStageId: z.string().uuid().nullable().optional(),
  workflowStageKey: z.string().nullable().optional(),
  currentWorkflowStage: z.object({
    id: z.string().uuid(),
    key: z.string(),
    label: z.string(),
    sortOrder: z.number().int(),
    isInitial: z.boolean(),
    isTerminal: z.boolean(),
  }).nullable().optional(),
  version: z.number().int(),
  total: z.string(),
  paid: z.string(),
  outstanding: z.string(),
  promisedAt: z.string(),
  createdAt: z.string(),
  customer: customerSummarySchema,
  customFields: z.record(z.string(), z.unknown()).optional(),
  items: z.array(z.object({
    id: z.string().uuid(),
    garmentName: z.string(),
    itemName: z.string().nullable().optional(),
    itemTypeKey: z.string().optional(),
    quantity: z.number().int(),
    unitPrice: z.string(),
    measurementSnapshot: z.record(z.string(), z.unknown()),
    customFields: z.record(z.string(), z.unknown()).optional(),
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
  renderedMessage: z.string().nullable(),
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
  template: z.object({ id: z.string().uuid(), key: z.string(), name: z.string() }).optional(),
  _count: z.object({ memberships: z.number().int() }).optional(),
});

const customFieldSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  businessId: z.string().uuid().nullable(),
  module: z.string(),
  screen: z.string(),
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  defaultValue: z.unknown().nullable(),
  validation: z.unknown().nullable(),
  options: z.unknown().nullable(),
  visibility: z.unknown().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
const workflowStageSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  businessId: z.string().uuid().nullable(),
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  isInitial: z.boolean(),
  isTerminal: z.boolean(),
  actions: z.array(z.string()),
});
const workflowTransitionSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  businessId: z.string().uuid().nullable(),
  fromStageId: z.string().uuid(),
  toStageId: z.string().uuid(),
  allowedRoleKeys: z.array(z.string()),
  actions: z.array(z.string()),
});
const templateItemTypeSchema = z.object({ key: z.string(), label: z.string() });
const notificationTemplateSchema = z.object({
  enabled: z.boolean(),
  body: z.string(),
  providerTemplateName: z.string().optional(),
  language: z.string().optional(),
});
const notificationTemplatesSchema = z.record(
  z.enum(['ORDER_CREATED', 'PAYMENT_RECEIVED', 'ORDER_READY']),
  notificationTemplateSchema,
);
export function parseNotificationTemplates(value: unknown) {
  return notificationTemplatesSchema.parse(value);
}
const businessTemplateSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  terminology: z.record(z.string(), z.string()),
  enabledModules: z.array(z.string()),
  itemTypes: z.array(templateItemTypeSchema),
  paymentMethods: z.array(z.string()),
  dashboardWidgets: z.array(z.string()),
  isSystem: z.boolean(),
  active: z.boolean(),
  fields: z.array(customFieldSchema),
  workflowStages: z.array(workflowStageSchema),
  workflowTransitions: z.array(workflowTransitionSchema),
});
const businessConfigurationSchema = z.object({
  business: z.object({
    id: z.string().uuid(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    type: z.string(),
    currency: z.string(),
    timezone: z.string(),
  }),
  template: z.object({
    id: z.string().uuid(),
    key: z.string(),
    name: z.string(),
    category: z.string(),
    itemTypes: z.array(templateItemTypeSchema),
  }),
  availableModules: z.array(z.string()),
  availablePaymentMethods: z.array(z.string()),
  availableDashboardWidgets: z.array(z.string()),
  terminology: z.record(z.string(), z.string()),
  enabledModules: z.array(z.string()),
  paymentMethods: z.array(z.string()),
  dashboardWidgets: z.array(z.string()),
  notificationTemplates: notificationTemplatesSchema,
  fields: z.array(customFieldSchema),
  workflow: z.object({
    stages: z.array(workflowStageSchema),
    transitions: z.array(workflowTransitionSchema),
  }),
  version: z.number().int(),
  publishedAt: z.string().nullable(),
});
const templateFieldInputSchema = z.object({
  module: z.string(),
  screen: z.string(),
  key: z.string(),
  label: z.string(),
  type: z.enum([
    'TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'DATETIME', 'DROPDOWN',
    'MULTI_SELECT', 'BOOLEAN', 'MEASUREMENT', 'REFERENCE', 'NOTES',
  ]),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  validation: z.unknown().optional(),
  options: z.unknown().optional(),
  visibility: z.unknown().optional(),
  sortOrder: z.number().int(),
});
const templateEditSchema = z.object({
  key: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().optional(),
  terminology: z.record(z.string(), z.string()),
  enabledModules: z.array(z.string()),
  itemTypes: z.array(templateItemTypeSchema),
  paymentMethods: z.array(z.string()),
  dashboardWidgets: z.array(z.string()),
  fields: z.array(templateFieldInputSchema),
  stages: z.array(z.object({
    key: z.string(),
    label: z.string(),
    sortOrder: z.number().int(),
    isInitial: z.boolean(),
    isTerminal: z.boolean(),
    actions: z.array(z.string()),
  })),
  transitions: z.array(z.object({
    from: z.string(),
    to: z.string(),
    allowedRoleKeys: z.array(z.string()),
    actions: z.array(z.string()),
  })),
});
export type BusinessConfiguration = z.infer<typeof businessConfigurationSchema>;
export type BusinessTemplate = z.infer<typeof businessTemplateSchema>;
export type BusinessTemplateInput = z.infer<typeof templateEditSchema>;
export function parseBusinessTemplateInput(value: unknown): BusinessTemplateInput {
  return templateEditSchema.parse(value);
}

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

const subscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  monthlyPrice: z.string(),
  yearlyPrice: z.string(),
  currency: z.string(),
  trialDays: z.number().int(),
  features: z.record(z.string(), z.boolean()),
  limits: z.record(z.string(), z.number()),
  active: z.boolean(),
  isDefault: z.boolean(),
  _count: z.object({ subscriptions: z.number().int(), payments: z.number().int() }).optional(),
});
const subscriptionStatusSchema = z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']);
const subscriptionSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  planId: z.string().uuid(),
  status: subscriptionStatusSchema,
  cycle: z.enum(['MONTHLY', 'YEARLY', 'CUSTOM']),
  startsAt: z.string(),
  endsAt: z.string(),
  graceUntil: z.string(),
  customPrice: z.string().nullable(),
  discountAmount: z.string(),
  complimentary: z.boolean(),
  grandfathered: z.boolean(),
  createdAt: z.string(),
  plan: subscriptionPlanSchema,
});
const subscriptionPaymentSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  planId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable(),
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ADJUSTED']),
  cycle: z.enum(['MONTHLY', 'YEARLY', 'CUSTOM']),
  transactionReference: z.string(),
  senderName: z.string(),
  amount: z.string(),
  method: z.string(),
  paymentDate: z.string(),
  invoiceNumber: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  plan: z.object({ name: z.string() }).or(subscriptionPlanSchema),
  business: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() }).optional(),
  submittedBy: z.object({ name: z.string(), email: z.string() }).optional(),
  reviewedBy: z.object({ name: z.string(), email: z.string() }).nullable().optional(),
  subscription: z.object({ startsAt: z.string(), endsAt: z.string() }).nullable().optional(),
});
const billingSettingsSchema = z.object({
  paymentMethods: z.array(z.string()),
  paymentInstructions: z.string(),
  gracePeriodDays: z.number().int(),
  expiryReminderDays: z.array(z.number().int()),
  enforcementEnabled: z.boolean(),
  supportContact: z.string(),
});
const platformBillingDashboardSchema = z.object({
  businesses: z.number().int(),
  active: z.number().int(),
  trial: z.number().int(),
  complimentary: z.number().int(),
  expired: z.number().int(),
  pendingPayments: z.number().int(),
  recordedRevenue: z.string(),
  approvedPaymentCount: z.number().int(),
  expiring: z.array(z.object({
    id: z.string().uuid(),
    endsAt: z.string(),
    business: z.object({ id: z.string().uuid(), name: z.string() }),
    plan: z.object({ name: z.string() }),
  })),
});

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type Customer = z.infer<typeof customerSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
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
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionPayment = z.infer<typeof subscriptionPaymentSchema>;
export type BillingSettings = z.infer<typeof billingSettingsSchema>;
export type PlatformBillingDashboard = z.infer<typeof platformBillingDashboardSchema>;
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

async function requestPdf(route: string, token: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}/api/v1${route}`, {
    headers: { accept: 'application/pdf', authorization: `Bearer ${token}` },
    credentials: 'omit',
  });
  if (!response.ok) {
    const payload: unknown = await response.json();
    const error = errorSchema.safeParse(payload);
    throw new ApiError(
      error.success ? error.data.error.message : `Request failed (${response.status})`,
      error.success ? error.data.error.code : 'REQUEST_FAILED',
      response.status,
    );
  }
  return response.blob();
}

async function requestCsv(route: string, token: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}/api/v1${route}`, {
    headers: { accept: 'text/csv', authorization: `Bearer ${token}` },
    credentials: 'omit',
  });
  if (!response.ok) {
    const payload: unknown = await response.json();
    const error = errorSchema.safeParse(payload);
    throw new ApiError(
      error.success ? error.data.error.message : `Request failed (${response.status})`,
      error.success ? error.data.error.code : 'REQUEST_FAILED',
      response.status,
    );
  }
  return response.blob();
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
  catalog(token: string, query = '', includeInactive = false) {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('q', query);
    if (includeInactive) params.set('includeInactive', 'true');
    return request(`/catalog?${params}`, z.object({
      items: z.array(catalogItemSchema),
      nextCursor: z.string().nullable(),
    }), { token });
  },
  createCatalogItem(token: string, input: {
    typeKey: string;
    name: string;
    description?: string;
    sku?: string;
    unit: string;
    unitPrice?: string;
    sortOrder: number;
    customFields: Record<string, unknown>;
  }) {
    return request('/catalog', z.object({ data: catalogItemSchema }), { token, method: 'POST', body: input });
  },
  updateCatalogItem(token: string, itemId: string, input: {
    version: number;
    typeKey?: string;
    name?: string;
    description?: string | null;
    sku?: string | null;
    unit?: string;
    unitPrice?: string | null;
    sortOrder?: number;
    active?: boolean;
    customFields?: Record<string, unknown>;
  }) {
    return request(`/catalog/${itemId}`, z.object({ data: catalogItemSchema }), {
      token,
      method: 'PATCH',
      body: input,
    });
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
  transitionWorkflow(token: string, order: Order, toStageKey: string) {
    return request(`/orders/${order.id}/workflow`, orderSchema.partial(), {
      token,
      method: 'POST',
      body: { toStageKey, version: order.version },
    });
  },
  templates(token: string) {
    return request('/measurements/templates', z.object({ items: z.array(templateSchema) }), { token });
  },
  businessConfiguration(token: string) {
    return request('/business/configuration', businessConfigurationSchema, { token });
  },
  updateBusinessConfiguration(token: string, input: {
    version: number;
    business?: Partial<BusinessConfiguration['business']>;
    terminologyOverrides?: Record<string, string>;
    enabledModules?: string[];
    paymentMethods?: string[];
    notificationTemplates?: z.infer<typeof notificationTemplatesSchema>;
    dashboardWidgets?: string[];
    publish?: boolean;
  }) {
    return request('/business/configuration', z.unknown(), { token, method: 'PUT', body: input });
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
  platformTemplates(token: string) {
    return request('/platform/templates', z.object({ items: z.array(businessTemplateSchema) }), { token });
  },
  createPlatformTemplate(token: string, input: BusinessTemplateInput) {
    return request('/platform/templates', businessTemplateSchema, { token, method: 'POST', body: input });
  },
  updatePlatformTemplate(token: string, templateId: string, input: BusinessTemplateInput) {
    return request(`/platform/templates/${templateId}`, businessTemplateSchema, { token, method: 'PUT', body: input });
  },
  createPlatformBusiness(token: string, input: { name: string; slug: string; templateKey?: string }) {
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
  shopSubscription(token: string) {
    return request('/subscriptions', z.object({
      subscription: subscriptionSchema.nullable(),
      plans: z.array(subscriptionPlanSchema),
      payments: z.array(subscriptionPaymentSchema),
      events: z.array(z.object({ id: z.string().uuid(), action: z.string(), metadata: z.record(z.string(), z.unknown()), createdAt: z.string() })),
      paymentInstructions: z.string(),
      paymentMethods: z.array(z.string()),
      supportContact: z.string(),
    }), { token });
  },
  submitSubscriptionPayment(token: string, input: {
    planId: string; cycle: 'MONTHLY' | 'YEARLY'; transactionReference: string;
    senderName: string; amount: string; method: string; paymentDate: string;
  }) {
    return request('/subscriptions/payments', subscriptionPaymentSchema, { token, method: 'POST', body: input });
  },
  platformBillingDashboard(token: string) {
    return request('/platform/billing/dashboard', platformBillingDashboardSchema, { token });
  },
  platformSubscriptionPlans(token: string) {
    return request('/platform/billing/plans', z.object({ items: z.array(subscriptionPlanSchema) }), { token });
  },
  createSubscriptionPlan(token: string, input: {
    name: string; description?: string; monthlyPrice: string; yearlyPrice: string; trialDays: number;
    features: Record<string, boolean>; limits: Record<string, number>; active: boolean; isDefault: boolean;
  }) {
    return request('/platform/billing/plans', subscriptionPlanSchema, { token, method: 'POST', body: input });
  },
  updateSubscriptionPlan(token: string, planId: string, input: Partial<{
    name: string; description: string; monthlyPrice: string; yearlyPrice: string; trialDays: number;
    features: Record<string, boolean>; limits: Record<string, number>; active: boolean; isDefault: boolean;
  }>) {
    return request(`/platform/billing/plans/${planId}`, subscriptionPlanSchema, { token, method: 'PATCH', body: input });
  },
  subscriptionPayments(token: string, status?: string, q = '', cursor?: string) {
    const params = new URLSearchParams({ limit: '100' });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    return request(`/platform/billing/payments?${params}`, z.object({
      items: z.array(subscriptionPaymentSchema),
      nextCursor: z.string().nullable(),
    }), { token });
  },
  reviewSubscriptionPayment(token: string, paymentId: string, input: { decision: 'APPROVE' | 'UNDER_REVIEW' } | { decision: 'REJECT'; reason: string }) {
    return request(`/platform/billing/payments/${paymentId}/review`, z.object({
      payment: subscriptionPaymentSchema,
      subscription: subscriptionSchema.omit({ plan: true }).nullable(),
    }), { token, method: 'PATCH', body: input });
  },
  billingSettings(token: string) {
    return request('/platform/billing/settings', billingSettingsSchema, { token });
  },
  updateBillingSettings(token: string, input: BillingSettings) {
    return request('/platform/billing/settings', billingSettingsSchema, { token, method: 'PUT', body: input });
  },
  platformBillingBusinesses(token: string) {
    return request('/platform/billing/businesses?limit=100', z.object({
      items: z.array(platformBusinessSchema),
      nextCursor: z.string().nullable(),
    }), { token });
  },
  platformBillingBusiness(token: string, businessId: string) {
    return request(`/platform/billing/businesses/${businessId}`, z.object({
      business: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), status: z.string() }),
      subscriptions: z.array(subscriptionSchema),
      payments: z.array(subscriptionPaymentSchema),
      events: z.array(z.object({ id: z.string().uuid(), action: z.string(), metadata: z.record(z.string(), z.unknown()), createdAt: z.string() })),
    }), { token });
  },
  assignBusinessSubscription(token: string, businessId: string, input: {
    planId: string; cycle: 'MONTHLY' | 'YEARLY' | 'CUSTOM'; startsAt: string; endsAt: string;
    status: 'ACTIVE' | 'TRIAL'; complimentary: boolean; customPrice?: string; discountAmount: string; reason: string;
  }) {
    return request(`/platform/billing/businesses/${businessId}/subscriptions`, subscriptionSchema.omit({ plan: true }), {
      token, method: 'POST', body: input,
    });
  },
  setSubscriptionStatus(token: string, subscriptionId: string, input: {
    status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'; endsAt?: string; reason: string;
  }) {
    return request(`/platform/billing/subscriptions/${subscriptionId}/status`, subscriptionSchema.omit({ plan: true }), {
      token, method: 'PATCH', body: input,
    });
  },
  recordSubscriptionAdjustment(token: string, paymentId: string, input: {
    kind: 'REFUND_RECORDED' | 'ADJUSTMENT_RECORDED'; amount: string; reason: string;
  }) {
    return request(`/platform/billing/payments/${paymentId}/adjustments`, z.object({
      id: z.string().uuid(),
      action: z.string(),
      metadata: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }), { token, method: 'POST', body: input });
  },
  subscriptionReceipt(token: string, paymentId: string) {
    return requestPdf(`/subscriptions/payments/${paymentId}/receipt.pdf`, token);
  },
  platformSubscriptionReceipt(token: string, paymentId: string) {
    return requestPdf(`/platform/billing/payments/${paymentId}/receipt.pdf`, token);
  },
  subscriptionReportCsv(token: string, from: string, to: string) {
    const params = new URLSearchParams({ from, to });
    return requestCsv(`/platform/billing/report.csv?${params}`, token);
  },
};
