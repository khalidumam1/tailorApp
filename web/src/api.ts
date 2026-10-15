import { z } from 'zod';
import {
  applicationBrandingSchema,
  createCustomerSchema,
  createMeasurementRevisionSchema,
  createOrderSchema,
  createPaymentSchema,
  type ApplicationBranding,
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
  stockVariantId: z.string().uuid().nullable(),
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
  status: z.string(),
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
  paid: z.string().optional(),
  outstanding: z.string().optional(),
  promisedAt: z.string(),
  createdAt: z.string(),
  customer: customerSummarySchema,
  customFields: z.record(z.string(), z.unknown()).optional(),
  items: z.array(z.object({
    id: z.string().uuid(),
    garmentName: z.string().optional(),
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

const erpAccountSchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  systemKey: z.string().nullable().optional(),
  isSystem: z.boolean().optional(),
  cashbookEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
  version: z.number().int().optional(),
  balance: z.string().optional(),
});
// Setup endpoints return the compact fields selected by ensureDefaultAccounts; the
// full account endpoints return `erpAccountSchema`.
const accountSetupResultSchema = z.object({
  accounts: z.array(z.object({
    id: z.string().uuid(),
    type: erpAccountSchema.shape.type,
    active: z.boolean(),
    systemKey: z.string().nullable(),
  })),
});
const accountingJournalSchema = z.object({
  id: z.string().uuid(),
  entryNumber: z.string(),
  entryDate: z.string(),
  memo: z.string(),
  sourceType: z.string(),
  status: z.string(),
  reversalOfId: z.string().uuid().nullable(),
  lines: z.array(z.object({
    id: z.string().uuid(),
    accountId: z.string().uuid(),
    debit: z.string(),
    credit: z.string(),
    memo: z.string().nullable(),
    account: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), type: z.string() }),
  })),
});
const inventoryVariantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sku: z.string().nullable(),
  active: z.boolean(),
  balances: z.array(z.object({
    quantity: z.string(),
    averageUnitCost: z.string(),
    location: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  })),
});
const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['MATERIAL', 'PRODUCT', 'SUPPLY']),
  name: z.string(),
  description: z.string().nullable(),
  baseUnit: z.string(),
  reorderPoint: z.string().nullable(),
  version: z.number().int(),
  active: z.boolean(),
  variants: z.array(inventoryVariantSchema),
});
const inventoryValuationItemSchema = z.object({
  variant: z.object({ id: z.string().uuid(), name: z.string(), sku: z.string().nullable(), stockItem: z.object({
    id: z.string().uuid(), name: z.string(), kind: z.string(), baseUnit: z.string(), reorderPoint: z.string().nullable(),
  }) }),
  location: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  quantity: z.string(), averageUnitCost: z.string(), value: z.string(), reorderPoint: z.string().nullable(), lowStock: z.boolean(),
});
const inventoryMovementSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  quantity: z.string(),
  unitCost: z.string(),
  occurredAt: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  note: z.string().nullable(),
  variant: z.object({ id: z.string().uuid(), name: z.string(), stockItem: z.object({ id: z.string().uuid(), name: z.string(), baseUnit: z.string() }) }).optional(),
  location: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }).optional(),
});
const supplierSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  contactName: z.string().nullable().optional(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  version: z.number().int(),
  active: z.boolean(),
  _count: z.object({ purchaseOrders: z.number().int(), settlements: z.number().int() }).optional(),
});
const supplierLedgerSchema = z.object({
  supplier: z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), phone: z.string().nullable(), email: z.string().nullable() }),
  entries: z.array(z.object({
    id: z.string().uuid(), kind: z.string(), occurredAt: z.string(), amount: z.string(), reference: z.string().nullable(),
    purchaseOrderNumber: z.string().nullable(), note: z.string().nullable(), runningBalance: z.string(),
  })),
  balance: z.string(),
});
const purchaseOrderSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  status: z.enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']),
  orderedAt: z.string(),
  dueAt: z.string().nullable(),
  subtotal: z.string(),
  taxAmount: z.string(),
  total: z.string(),
  notes: z.string().nullable(),
  receivedTotal: z.string().optional(),
  outstanding: z.string().optional(),
  hasOutstanding: z.boolean().optional(),
  refundCapacity: z.string().optional(),
  hasRefundCapacity: z.boolean().optional(),
  supplier: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  lines: z.array(z.object({
    id: z.string().uuid(),
    variantId: z.string().uuid(),
    description: z.string(),
    orderedQuantity: z.string(),
    receivedQuantity: z.string(),
    remainingQuantity: z.string().optional(),
    hasRemainingQuantity: z.boolean().optional(),
    unitCost: z.string(),
    lineTotal: z.string(),
    variant: z.object({ id: z.string().uuid(), name: z.string(), stockItem: z.object({ name: z.string(), baseUnit: z.string() }) }),
  })),
  receipts: z.array(z.object({ id: z.string().uuid(), receiptNumber: z.string(), receivedAt: z.string(), total: z.string() })).optional(),
  settlements: z.array(z.object({ id: z.string().uuid(), kind: z.enum(['PAYMENT', 'REFUND']), amount: z.string(), occurredAt: z.string() })).optional(),
});
const cashTransactionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['RECEIPT', 'EXPENSE', 'TRANSFER']),
  amount: z.string(),
  occurredAt: z.string(),
  reference: z.string().nullable(),
  memo: z.string(),
  financialAccount: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }).optional(),
  contraAccount: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }).optional(),
  journalEntry: z.object({ id: z.string().uuid(), entryNumber: z.string() }).nullable().optional(),
});
const trialBalanceRowSchema = z.object({
  accountId: z.string().uuid(), code: z.string(), name: z.string(), type: z.string(),
  debitBalance: z.string(), creditBalance: z.string(),
});
const profitLossSchema = z.object({
  from: z.string().nullable(), to: z.string().nullable(),
  income: z.array(z.object({ accountId: z.string().uuid(), code: z.string(), name: z.string(), amount: z.string() })),
  expenses: z.array(z.object({ accountId: z.string().uuid(), code: z.string(), name: z.string(), amount: z.string() })),
  totalIncome: z.string(), totalExpenses: z.string(), netProfit: z.string(), currency: z.string(),
});
const balanceSheetSchema = z.object({
  asOf: z.string().nullable(),
  assets: z.array(z.object({ accountId: z.string().uuid(), code: z.string(), name: z.string(), balance: z.string() })),
  liabilities: z.array(z.object({ accountId: z.string().uuid(), code: z.string(), name: z.string(), balance: z.string() })),
  equity: z.array(z.object({ accountId: z.string().uuid(), code: z.string(), name: z.string(), balance: z.string() })),
  currentEarnings: z.string(), totalAssets: z.string(), totalLiabilities: z.string(), totalEquity: z.string(), liabilitiesAndEquity: z.string(), currency: z.string(),
});

const notificationSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  paymentId: z.string().uuid().nullable(),
  recipientName: z.string().nullable(),
  kind: z.enum([
    'ORDER_CREATED',
    'PAYMENT_RECEIVED',
    'ORDER_READY',
    'STATUS_CHANGED',
    'PAYMENT_DUE',
    'SUBSCRIPTION_EXPIRING',
    'CUSTOMER_CREATED',
    'CUSTOMER_UPDATED',
    'MEASUREMENT_APPENDED',
    'SUBSCRIPTION_PAYMENT_SUBMITTED',
    'SUBSCRIPTION_PAYMENT_UNDER_REVIEW',
    'SUBSCRIPTION_PAYMENT_APPROVED',
    'SUBSCRIPTION_PAYMENT_REJECTED',
  ]),
  status: z.enum(['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NOT_SENT']),
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
  /** Currently active owner, or null when nobody owns the workspace. */
  owner: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }).nullable().optional(),
  /** Memberships with access today (removed members are excluded). */
  activeMemberships: z.number().int().optional(),
});

const platformBusinessModulesSchema = z.object({
  business: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    template: z.object({ key: z.string(), name: z.string() }).nullable(),
  }),
  availableModules: z.array(z.string()),
  enabledModules: z.array(z.string()),
});

const platformBusinessMemberSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  createdAt: z.string(),
  user: z.object({ id: z.string().uuid(), name: z.string(), email: z.string(), active: z.boolean() }),
  role: z.object({ id: z.string().uuid(), name: z.string() }),
  /** How many other businesses this user can still sign in to. */
  otherActiveBusinesses: z.number().int(),
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
  recipientPolicy: z.enum(['CUSTOMER', 'BUSINESS_CONTACT']).optional(),
});
const notificationTemplatesSchema = z.record(
  z.enum([
    'ORDER_CREATED',
    'PAYMENT_RECEIVED',
    'ORDER_READY',
    'STATUS_CHANGED',
    'PAYMENT_DUE',
    'SUBSCRIPTION_EXPIRING',
    'CUSTOMER_CREATED',
    'CUSTOMER_UPDATED',
    'MEASUREMENT_APPENDED',
    'SUBSCRIPTION_PAYMENT_SUBMITTED',
    'SUBSCRIPTION_PAYMENT_UNDER_REVIEW',
    'SUBSCRIPTION_PAYMENT_APPROVED',
    'SUBSCRIPTION_PAYMENT_REJECTED',
  ]),
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
const businessTemplateRevisionSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  version: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  actorId: z.string().uuid().nullable(),
  requestId: z.string(),
  createdAt: z.string(),
  actor: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }).nullable(),
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
  }),
  itemTypes: z.array(templateItemTypeSchema),
  availableModules: z.array(z.string()),
  availablePaymentMethods: z.array(z.string()),
  availableDashboardWidgets: z.array(z.string()),
  terminology: z.record(z.string(), z.string()),
  enabledModules: z.array(z.string()),
  paymentMethods: z.array(z.string()),
  contactPhone: z.string().nullable(),
  dashboardWidgets: z.array(z.string()),
  notificationTemplates: notificationTemplatesSchema,
  fields: z.array(customFieldSchema),
  tenantFields: z.array(customFieldSchema),
  workflow: z.object({
    stages: z.array(workflowStageSchema),
    transitions: z.array(workflowTransitionSchema),
  }),
  workflowIsTenantScoped: z.boolean(),
  version: z.number().int(),
  configurationVersion: z.number().int(),
  templateVersion: z.number().int(),
  cacheVersion: z.number().int(),
  publishedAt: z.string().nullable(),
});
const businessFieldInputSchema = z.object({
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
const businessStageInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  isInitial: z.boolean(),
  isTerminal: z.boolean(),
  actions: z.array(z.string()),
});
const businessTransitionInputSchema = z.object({
  from: z.string(),
  to: z.string(),
  allowedRoleKeys: z.array(z.string()),
  actions: z.array(z.string()),
});
const businessStructureResultSchema = z.object({
  version: z.number().int(),
  templateVersion: z.number().int(),
});
const businessConfigurationHistorySchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    actorName: z.string(),
    version: z.number().int().nullable(),
    templateVersion: z.number().int().nullable(),
    snapshot: z.unknown().nullable(),
    createdAt: z.string(),
  })),
  nextCursor: z.string().uuid().nullable(),
});
const businessPermissionSchema = z.object({ key: z.string(), description: z.string() });
const businessRoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  memberCount: z.number().int().optional(),
});
const businessMemberSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  createdAt: z.string(),
  user: z.object({ id: z.string().uuid(), name: z.string(), email: z.string(), active: z.boolean() }),
  role: z.object({ id: z.string().uuid(), name: z.string() }),
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
export type BusinessTemplateRevision = z.infer<typeof businessTemplateRevisionSchema>;
export type BusinessTemplateInput = z.infer<typeof templateEditSchema>;
export type BusinessFieldInput = z.infer<typeof businessFieldInputSchema>;
export type BusinessStageInput = z.infer<typeof businessStageInputSchema>;
export type BusinessTransitionInput = z.infer<typeof businessTransitionInputSchema>;
export type BusinessConfigurationHistoryEntry = z.infer<typeof businessConfigurationHistorySchema>['items'][number];
export type BusinessRole = z.infer<typeof businessRoleSchema>;
export type BusinessMember = z.infer<typeof businessMemberSchema>;
export type BusinessPermission = z.infer<typeof businessPermissionSchema>;
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
}).passthrough();

export type ErpAccount = z.infer<typeof erpAccountSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InventoryValuationItem = z.infer<typeof inventoryValuationItemSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type SupplierLedger = z.infer<typeof supplierLedgerSchema>;
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type CashTransaction = z.infer<typeof cashTransactionSchema>;
export type TrialBalanceRow = z.infer<typeof trialBalanceRowSchema>;
export type AccountingJournal = z.infer<typeof accountingJournalSchema>;
export type ProfitLossReport = z.infer<typeof profitLossSchema>;
export type BalanceSheetReport = z.infer<typeof balanceSheetSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type LoginResult = z.infer<typeof loginResponseSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type MeasurementTemplate = z.infer<typeof templateSchema>;
export type MeasurementProfile = z.infer<typeof profileSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type WhatsAppNotification = z.infer<typeof notificationSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type PlatformBusiness = z.infer<typeof platformBusinessSchema>;
export type PlatformBusinessModules = z.infer<typeof platformBusinessModulesSchema>;
export type PlatformBusinessMember = z.infer<typeof platformBusinessMemberSchema>;
export type PlatformBusinessMembers = {
  business: { id: string; name: string; slug: string; status: PlatformBusiness['status'] };
  items: PlatformBusinessMember[];
  totalCount: number;
  activeCount: number;
  activeOwnerCount: number;
};
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
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiBaseUrl = (import.meta.env.API_BASE_URL ?? '').replace(/\/+$/, '');
const refreshInFlight = new Map<string, Promise<z.infer<typeof refreshedSessionSchema>>>();
const refreshedAliases = new Map<string, z.infer<typeof refreshedSessionSchema>>();
let refreshGeneration = 0;

export function clearRefreshCache(refreshToken?: string): void {
  if (!refreshToken) {
    refreshGeneration += 1;
    refreshInFlight.clear();
    refreshedAliases.clear();
    return;
  }
  const sessionTokens = new Set<string>([refreshToken]);
  let current = refreshedAliases.get(refreshToken);
  while (current && !sessionTokens.has(current.refreshToken)) {
    sessionTokens.add(current.refreshToken);
    current = refreshedAliases.get(current.refreshToken);
  }
  for (const [oldToken, rotation] of refreshedAliases) {
    if (sessionTokens.has(oldToken) || sessionTokens.has(rotation.refreshToken)) refreshedAliases.delete(oldToken);
  }
  for (const token of sessionTokens) refreshInFlight.delete(token);
}

function rememberRefresh(previousToken: string, next: z.infer<typeof refreshedSessionSchema>): void {
  // Update older aliases too: callers holding an old React closure must receive
  // the latest rotated pair, not an already-revoked intermediate token.
  for (const [oldToken, current] of refreshedAliases) {
    if (current.refreshToken === previousToken) refreshedAliases.set(oldToken, next);
  }
  refreshedAliases.delete(previousToken);
  refreshedAliases.set(previousToken, next);
  while (refreshedAliases.size > 32) {
    const oldest = refreshedAliases.keys().next().value;
    if (oldest === undefined) break;
    refreshedAliases.delete(oldest);
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new ApiError('The server response could not be read. Please try again.', 'INVALID_RESPONSE', response.status,
      response.headers.get('x-request-id') ?? undefined);
  }
  if (!body.trim()) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function responseRequestId(response: Response, payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'requestId' in payload
    && typeof payload.requestId === 'string') return payload.requestId;
  return response.headers.get('x-request-id') ?? undefined;
}

function errorFromResponse(response: Response, payload: unknown): ApiError {
  const error = errorSchema.safeParse(payload);
  return new ApiError(
    error.success ? error.data.error.message : `The server could not complete the request (HTTP ${response.status}).`,
    error.success ? error.data.error.code : 'REQUEST_FAILED',
    response.status,
    responseRequestId(response, payload),
  );
}

async function fetchApi(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (cause) {
    const timedOut = cause && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError';
    throw new ApiError(
      timedOut ? 'The request timed out. Check your connection and try again.' : 'Could not reach the service. Check your connection and try again.',
      timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? 408 : 0,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T>(
  route: string,
  schema: z.ZodType<T>,
  options: { token?: string; method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers({ accept: 'application/json' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  const response = await fetchApi(`${apiBaseUrl}/api/v1${route}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'omit',
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) throw errorFromResponse(response, payload);
  const requestId = responseRequestId(response, payload);
  const envelope = z.object({ data: z.unknown() }).safeParse(payload);
  if (!envelope.success) {
    throw new ApiError('The server returned an unexpected response. Please retry; contact support if it continues.',
      'INVALID_RESPONSE', 502, requestId);
  }
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    throw new ApiError('The server returned an unexpected response. Please retry; contact support if it continues.',
      'INVALID_RESPONSE', 502, requestId);
  }
  return parsed.data;
}

async function requestBlob(route: string, token: string, accept: string): Promise<Blob> {
  const response = await fetchApi(`${apiBaseUrl}/api/v1${route}`, {
    headers: { accept, authorization: `Bearer ${token}` },
    credentials: 'omit',
  });
  if (!response.ok) throw errorFromResponse(response, await readResponsePayload(response));
  return response.blob();
}

async function requestPdf(route: string, token: string): Promise<Blob> {
  return requestBlob(route, token, 'application/pdf');
}

async function requestCsv(route: string, token: string): Promise<Blob> {
  return requestBlob(route, token, 'text/csv');
}

async function refreshTokens(refreshToken: string): Promise<z.infer<typeof refreshedSessionSchema>> {
  const knownRotation = refreshedAliases.get(refreshToken);
  if (knownRotation) return knownRotation;
  const inFlight = refreshInFlight.get(refreshToken);
  if (inFlight) return inFlight;

  const generation = refreshGeneration;
  const rotation = request('/auth/refresh', refreshedSessionSchema, {
    method: 'POST',
    body: { refreshToken },
  }).then((next) => {
    if (generation !== refreshGeneration) {
      throw new ApiError('The session has ended. Please sign in again.', 'SESSION_ENDED', 401);
    }
    rememberRefresh(refreshToken, next);
    return next;
  }).finally(() => refreshInFlight.delete(refreshToken));
  refreshInFlight.set(refreshToken, rotation);
  return rotation;
}

async function latestRefreshToken(refreshToken: string): Promise<string> {
  let latest = refreshedAliases.get(refreshToken);
  const initialRotation = refreshInFlight.get(refreshToken);
  if (initialRotation) {
    try {
      latest = await initialRotation;
    } catch {
      latest = refreshedAliases.get(refreshToken) ?? latest;
    }
  }
  const visited = new Set<string>([refreshToken]);
  for (let hop = 0; latest && hop < 32; hop += 1) {
    const currentToken = latest.refreshToken;
    if (visited.has(currentToken)) break;
    visited.add(currentToken);
    const alias = refreshedAliases.get(currentToken);
    if (alias) {
      latest = alias;
      continue;
    }
    const pending = refreshInFlight.get(currentToken);
    if (!pending) break;
    try {
      latest = await pending;
    } catch {
      break;
    }
  }
  return latest?.refreshToken ?? refreshToken;
}

export const api = {
  login(email: string, password: string, scope?: 'business' | 'platform', businessId?: string) {
    return request('/auth/login', loginResponseSchema, {
      method: 'POST',
      body: { email, password, ...(scope ? { scope } : {}), ...(businessId ? { businessId } : {}) },
    });
  },
  async logout(token: string, refreshToken: string) {
    const currentRefreshToken = await latestRefreshToken(refreshToken);
    return request('/auth/logout', z.object({ revoked: z.boolean() }), {
      token,
      method: 'POST',
      body: { refreshToken: currentRefreshToken },
    });
  },
  me(token: string) {
    return request('/auth/me', meSchema, { token });
  },
  refresh(refreshToken: string) {
    return refreshTokens(refreshToken);
  },
  applicationBranding(): Promise<ApplicationBranding> {
    return request('/public/application-branding', applicationBrandingSchema);
  },
  dashboard(token: string) {
    return request('/reports/dashboard', dashboardSchema, { token });
  },
  inventoryItems(token: string, query = '', includeInactive = false) {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('q', query);
    if (includeInactive) params.set('includeInactive', 'true');
    return request(`/inventory/items?${params}`, z.object({ items: z.array(inventoryItemSchema) }), { token });
  },
  inventoryValuation(token: string) {
    return request('/inventory/valuation', z.object({ totalValue: z.string(), currency: z.string(), items: z.array(inventoryValuationItemSchema) }), { token });
  },
  inventoryReorderAlerts(token: string) {
    return request('/inventory/reorder-alerts', z.object({
      items: z.array(z.object({ variantId: z.string().uuid(), itemId: z.string().uuid(), itemName: z.string(), variantName: z.string(), kind: z.string(), quantity: z.string(), reorderPoint: z.string(), unit: z.string() })),
      count: z.number().int(),
    }), { token });
  },
  inventoryMovements(token: string, query: { variantId?: string; limit?: number } = {}) {
    const params = new URLSearchParams({ limit: String(query.limit ?? 50) });
    if (query.variantId) params.set('variantId', query.variantId);
    return request(`/inventory/movements?${params}`, z.object({ items: z.array(inventoryMovementSchema), nextCursor: z.string().nullable() }), { token });
  },
  inventoryLocations(token: string) {
    return request('/inventory/locations', z.object({ items: z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), isDefault: z.boolean(), active: z.boolean() })) }), { token });
  },
  createInventoryLocation(token: string, input: { code: string; name: string }) {
    return request('/inventory/locations', z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), isDefault: z.boolean(), active: z.boolean() }), { token, method: 'POST', body: input });
  },
  createInventoryItem(token: string, input: {
    kind: 'MATERIAL' | 'PRODUCT' | 'SUPPLY'; name: string; description?: string | null; baseUnit: string;
    reorderPoint?: string | null; variant?: { name?: string; sku?: string | null; attributes?: Record<string, unknown>; opening?: { quantity: string; unitCost: string; locationId?: string } };
  }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/inventory/items', inventoryItemSchema, { token, method: 'POST', body: input, idempotencyKey });
  },
  createInventoryVariant(token: string, itemId: string, input: {
    name: string; sku?: string | null; attributes?: Record<string, unknown>;
    opening?: { quantity: string; unitCost: string; locationId?: string };
  }, idempotencyKey: string = crypto.randomUUID()) {
    return request(`/inventory/items/${itemId}/variants`, inventoryVariantSchema, { token, method: 'POST', body: input, idempotencyKey });
  },
  createInventoryMovement(token: string, input: {
    variantId: string; locationId?: string; kind: 'OPENING' | 'RECEIPT' | 'CONSUMPTION' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'WASTAGE' | 'ADJUSTMENT';
    direction?: 'IN' | 'OUT'; quantity: string; unitCost?: string; counterAccountId?: string; note?: string; occurredAt?: string;
  }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/inventory/movements', inventoryMovementSchema, { token, method: 'POST', body: input, idempotencyKey });
  },
  transferInventory(token: string, input: { variantId: string; fromLocationId: string; toLocationId: string; quantity: string; note?: string; occurredAt?: string }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/inventory/transfers', z.object({ movedOut: inventoryMovementSchema, movedIn: inventoryMovementSchema }), { token, method: 'POST', body: input, idempotencyKey });
  },
  reverseInventoryMovement(token: string, movementId: string, reason: string, idempotencyKey: string = crypto.randomUUID()) {
    return request(`/inventory/movements/${movementId}/reversals`, inventoryMovementSchema, { token, method: 'POST', body: { reason }, idempotencyKey });
  },
  suppliers(token: string, query = '', includeInactive = false) {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('q', query);
    if (includeInactive) params.set('includeInactive', 'true');
    return request(`/suppliers?${params}`, z.object({ items: z.array(supplierSchema), nextCursor: z.string().nullable() }), { token });
  },
  createSupplier(token: string, input: { name: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/suppliers', supplierSchema, { token, method: 'POST', body: input, idempotencyKey });
  },
  updateSupplier(token: string, supplierId: string, input: { version: number; name?: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; active?: boolean }) {
    return request(`/suppliers/${supplierId}`, supplierSchema, { token, method: 'PATCH', body: input });
  },
  supplierLedger(token: string, supplierId: string) {
    return request(`/suppliers/${supplierId}/ledger`, supplierLedgerSchema, { token });
  },
  purchases(token: string, query = '') {
    const params = new URLSearchParams({ limit: '100' });
    if (query) params.set('q', query);
    return request(`/purchases?${params}`, z.object({ items: z.array(purchaseOrderSchema) }), { token });
  },
  createPurchaseOrder(token: string, input: { supplierId: string; orderedAt?: string; dueAt?: string | null; notes?: string | null; lines: Array<{ variantId: string; description?: string; quantity: string; unitCost: string }> }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/purchases', purchaseOrderSchema, { token, method: 'POST', body: input, idempotencyKey });
  },
  receivePurchaseOrder(token: string, purchaseOrderId: string, input: { invoiceReference?: string | null; receivedAt?: string; lines: Array<{ purchaseOrderLineId: string; quantity: string; unitCost?: string; locationId?: string }> }, idempotencyKey: string = crypto.randomUUID()) {
    return request(`/purchases/${purchaseOrderId}/receive`, z.unknown(), { token, method: 'POST', body: input, idempotencyKey });
  },
  settlePurchaseOrder(token: string, purchaseOrderId: string, input: { kind: 'PAYMENT' | 'REFUND'; financialAccountId: string; amount: string; reference?: string | null; note?: string | null; occurredAt?: string }, idempotencyKey: string = crypto.randomUUID()) {
    return request(`/purchases/${purchaseOrderId}/settlements`, z.unknown(), { token, method: 'POST', body: input, idempotencyKey });
  },
  cashbookSetup(token: string) {
    return request('/cashbook/setup', accountSetupResultSchema, { token, method: 'POST' });
  },
  cashbookAccounts(token: string) {
    return request('/cashbook/accounts', z.object({ items: z.array(erpAccountSchema), setupRequired: z.boolean() }), { token });
  },
  cashbookCategories(token: string) {
    return request('/cashbook/categories', z.object({ items: z.array(erpAccountSchema) }), { token });
  },
  createCashbookAccount(token: string, input: { code: string; name: string; description?: string | null }) {
    return request('/cashbook/accounts', erpAccountSchema, { token, method: 'POST', body: input });
  },
  updateCashbookAccount(token: string, accountId: string, input: { version: number; name?: string; description?: string | null }) {
    return request(`/cashbook/accounts/${accountId}`, erpAccountSchema, { token, method: 'PATCH', body: input });
  },
  setCashbookOpeningBalance(token: string, accountId: string, input: { amount: string; asOf: string }, idempotencyKey: string = crypto.randomUUID()) {
    return request(`/cashbook/accounts/${accountId}/opening`, z.unknown(), { token, method: 'POST', body: input, idempotencyKey });
  },
  createCashbookCategory(token: string, input: { code: string; name: string; type: 'INCOME' | 'EXPENSE' }) {
    return request('/cashbook/categories', erpAccountSchema, { token, method: 'POST', body: input });
  },
  updateCashbookCategory(token: string, accountId: string, input: { version: number; name?: string; description?: string | null }) {
    return request(`/cashbook/categories/${accountId}`, erpAccountSchema, { token, method: 'PATCH', body: input });
  },
  cashbookTransactions(token: string, query: { accountId?: string; limit?: number } = {}) {
    const params = new URLSearchParams({ limit: String(query.limit ?? 100) });
    if (query.accountId) params.set('accountId', query.accountId);
    return request(`/cashbook/transactions?${params}`, z.object({ items: z.array(cashTransactionSchema) }), { token });
  },
  createCashbookTransaction(token: string, input: { kind: 'RECEIPT' | 'EXPENSE' | 'TRANSFER'; financialAccountId: string; contraAccountId: string; amount: string; occurredAt?: string; reference?: string | null; memo: string }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/cashbook/transactions', cashTransactionSchema, { token, method: 'POST', body: input, idempotencyKey });
  },
  cashbookReconciliations(token: string) {
    return request('/cashbook/reconciliations', z.object({ items: z.array(z.object({
      id: z.string().uuid(), accountId: z.string().uuid(), statementStart: z.string(), statementEnd: z.string(),
      openingBalance: z.string(), closingBalance: z.string(), status: z.enum(['OPEN', 'CLOSED']), closedAt: z.string().nullable(),
      account: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
      _count: z.object({ matches: z.number().int() }),
    })) }), { token });
  },
  startBankReconciliation(token: string, input: { accountId: string; statementStart: string; statementEnd: string; openingBalance: string; closingBalance: string }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/cashbook/reconciliations', z.unknown(), { token, method: 'POST', body: input, idempotencyKey });
  },
  bankReconciliationLines(token: string, reconciliationId: string) {
    return request(`/cashbook/reconciliations/${reconciliationId}/lines`, z.object({
      reconciliation: z.object({ id: z.string().uuid(), status: z.enum(['OPEN', 'CLOSED']), accountId: z.string().uuid(), openingBalance: z.string(), closingBalance: z.string() }),
      items: z.array(z.object({ id: z.string().uuid(), debit: z.string(), credit: z.string(), matched: z.boolean(), signedAmount: z.string(), journalEntry: z.object({ id: z.string().uuid(), entryNumber: z.string(), entryDate: z.string(), memo: z.string(), sourceType: z.string() }) })),
    }), { token });
  },
  matchBankReconciliationLines(token: string, reconciliationId: string, journalLineIds: string[]) {
    return request(`/cashbook/reconciliations/${reconciliationId}/matches`, z.object({ matchedCount: z.number().int() }), { token, method: 'POST', body: { journalLineIds } });
  },
  closeBankReconciliation(token: string, reconciliationId: string) {
    return request(`/cashbook/reconciliations/${reconciliationId}/close`, z.unknown(), { token, method: 'POST' });
  },
  accountingSetup(token: string) {
    return request('/accounting/setup', accountSetupResultSchema, { token, method: 'POST' });
  },
  accountingAccounts(token: string) {
    return request('/accounting/accounts', z.object({ items: z.array(erpAccountSchema), setupRequired: z.boolean() }), { token });
  },
  createAccountingAccount(token: string, input: { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'; description?: string | null; cashbookEnabled?: boolean; parentId?: string | null }) {
    return request('/accounting/accounts', erpAccountSchema, { token, method: 'POST', body: input });
  },
  updateAccountingAccount(token: string, accountId: string, input: { version: number; name?: string; description?: string | null; active?: boolean; cashbookEnabled?: boolean; parentId?: string | null }) {
    return request(`/accounting/accounts/${accountId}`, erpAccountSchema, { token, method: 'PATCH', body: input });
  },
  accountingJournals(token: string, query: { from?: string; to?: string; limit?: number } = {}) {
    const params = new URLSearchParams({ limit: String(query.limit ?? 100) });
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return request(`/accounting/journals?${params}`, z.object({ items: z.array(accountingJournalSchema), nextCursor: z.string().nullable() }), { token });
  },
  postAccountingJournal(token: string, input: { entryDate?: string; memo: string; lines: Array<{ accountId: string; debit: string; credit: string; memo?: string }> }, idempotencyKey: string = crypto.randomUUID()) {
    return request('/accounting/journals', z.unknown(), { token, method: 'POST', body: input, idempotencyKey });
  },
  reverseAccountingJournal(token: string, entryId: string, reason: string, idempotencyKey: string = crypto.randomUUID()) {
    return request(`/accounting/journals/${entryId}/reversals`, z.unknown(), { token, method: 'POST', body: { reason }, idempotencyKey });
  },
  trialBalance(token: string, asOf?: string) {
    const params = asOf ? `?${new URLSearchParams({ asOf })}` : '';
    return request(`/accounting/reports/trial-balance${params}`, z.object({ asOf: z.string().nullable(), items: z.array(trialBalanceRowSchema), debitTotal: z.string(), creditTotal: z.string(), currency: z.string() }), { token });
  },
  profitLoss(token: string, range: { from?: string; to?: string } = {}) {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    return request(`/accounting/reports/profit-loss${params.size ? `?${params}` : ''}`, profitLossSchema, { token });
  },
  balanceSheet(token: string, asOf?: string) {
    const params = asOf ? `?${new URLSearchParams({ asOf })}` : '';
    return request(`/accounting/reports/balance-sheet${params}`, balanceSheetSchema, { token });
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
    stockVariantId?: string | null;
    sortOrder: number;
    customFields: Record<string, unknown>;
  }) {
    return request('/catalog', catalogItemSchema, { token, method: 'POST', body: input });
  },
  updateCatalogItem(token: string, itemId: string, input: {
    version: number;
    typeKey?: string;
    name?: string;
    description?: string | null;
    sku?: string | null;
    unit?: string;
    unitPrice?: string | null;
    stockVariantId?: string | null;
    sortOrder?: number;
    active?: boolean;
    customFields?: Record<string, unknown>;
  }) {
    return request(`/catalog/${itemId}`, catalogItemSchema, {
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
  createOrder(token: string, input: OrderInput, idempotencyKey: string = crypto.randomUUID()) {
    return request('/orders', orderSchema.omit({ paid: true, outstanding: true }), {
      token,
      method: 'POST',
      body: input,
      idempotencyKey,
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
  businessConfigurationHistory(token: string, cursor?: string) {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return request(`/business/configuration/history?${params}`, businessConfigurationHistorySchema, { token });
  },
  businessPermissions(token: string) {
    return request('/business/permissions', z.object({ items: z.array(businessPermissionSchema) }), { token });
  },
  businessRoles(token: string) {
    return request('/business/roles', z.object({ items: z.array(businessRoleSchema) }), { token });
  },
  createBusinessRole(token: string, input: { name: string; permissions: string[] }) {
    return request('/business/roles', businessRoleSchema, { token, method: 'POST', body: input });
  },
  updateBusinessRole(token: string, roleId: string, input: { name: string; permissions: string[] }) {
    return request(`/business/roles/${roleId}`, businessRoleSchema, { token, method: 'PATCH', body: input });
  },
  deleteBusinessRole(token: string, roleId: string) {
    return request(`/business/roles/${roleId}`, z.unknown(), { token, method: 'DELETE' });
  },
  businessStaff(token: string) {
    return request('/business/staff', z.object({ items: z.array(businessMemberSchema) }), { token });
  },
  createBusinessStaff(token: string, input: { name: string; email: string; initialPassword: string; roleId: string }) {
    return request('/business/staff', businessMemberSchema, { token, method: 'POST', body: input });
  },
  updateBusinessStaff(token: string, membershipId: string, input: { roleId?: string; active?: boolean }) {
    return request(`/business/staff/${membershipId}`, businessMemberSchema, { token, method: 'PATCH', body: input });
  },
  removeBusinessStaff(token: string, membershipId: string, reason?: string) {
    return request(`/business/staff/${membershipId}`, businessMemberSchema, {
      token,
      method: 'DELETE',
      ...(reason ? { body: { reason } } : {}),
    });
  },
  updateBusinessConfiguration(token: string, input: {
    version: number;
    business?: Partial<BusinessConfiguration['business']>;
    terminologyOverrides?: Record<string, string>;
    enabledModules?: string[];
    itemTypes?: BusinessConfiguration['itemTypes'];
    paymentMethods?: string[];
    notificationTemplates?: z.infer<typeof notificationTemplatesSchema>;
    contactPhone?: string | null;
    dashboardWidgets?: string[];
    publish?: boolean;
  }) {
    return request('/business/configuration', z.unknown(), { token, method: 'PUT', body: input });
  },
  updateBusinessStructure(token: string, input: {
    version: number;
    templateVersion: number;
    fields: BusinessFieldInput[];
    stages: BusinessStageInput[];
    transitions: BusinessTransitionInput[];
  }) {
    return request('/business/configuration/structure', businessStructureResultSchema, {
      token,
      method: 'PUT',
      body: input,
    });
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
  platformBusinessModules(token: string, businessId: string) {
    return request(`/platform/businesses/${businessId}/modules`, platformBusinessModulesSchema, { token });
  },
  setPlatformBusinessModules(token: string, businessId: string, enabledModules: string[]) {
    return request(`/platform/businesses/${businessId}/modules`, platformBusinessModulesSchema.extend({ unchanged: z.boolean().optional() }), {
      token,
      method: 'PUT',
      body: { enabledModules },
    });
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
  platformTemplateRevisions(token: string, templateId: string) {
    return request(`/platform/templates/${templateId}/revisions`, z.object({
      items: z.array(businessTemplateRevisionSchema),
    }), { token });
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
  platformBusinessMembers(token: string, businessId: string) {
    return request(`/platform/businesses/${businessId}/members`, z.object({
      business: z.object({
        id: z.string().uuid(),
        name: z.string(),
        slug: z.string(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
      }),
      items: z.array(platformBusinessMemberSchema),
      totalCount: z.number().int(),
      activeCount: z.number().int(),
      activeOwnerCount: z.number().int(),
    }), { token });
  },
  removeBusinessMember(token: string, businessId: string, membershipId: string, reason?: string) {
    return request(`/platform/businesses/${businessId}/members/${membershipId}`, platformBusinessMemberSchema, {
      token,
      method: 'DELETE',
      ...(reason ? { body: { reason } } : {}),
    });
  },
  restoreBusinessMember(token: string, businessId: string, membershipId: string) {
    return request(`/platform/businesses/${businessId}/members/${membershipId}`, platformBusinessMemberSchema, {
      token,
      method: 'PATCH',
      body: { active: true },
    });
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
  platformApplicationBranding(token: string): Promise<ApplicationBranding> {
    return request('/platform/application-branding', applicationBrandingSchema, { token });
  },
  updatePlatformApplicationBranding(token: string, input: ApplicationBranding): Promise<ApplicationBranding> {
    return request('/platform/application-branding', applicationBrandingSchema, { token, method: 'PUT', body: input });
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
