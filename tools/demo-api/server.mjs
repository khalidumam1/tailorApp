/**
 * Demo API server — read-only-fixture stand-in for @tailor/api.
 *
 * This exists so the web workspace can be run, reviewed and screenshotted
 * without a PostgreSQL instance (the sandbox has no database and no access to
 * the Prisma engine download host). It implements the same HTTP contract as
 * `backend/src` — same routes, same `{ data: ... }` envelope, same shapes the
 * zod schemas in `web/src/api.ts` validate — using in-memory fixtures.
 *
 * It is NOT part of the product build. Start it explicitly:
 *   node tools/demo-api/server.mjs
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.DEMO_API_PORT ?? 5000);

const hash = (seed) => crypto.createHash('md5').update(String(seed)).digest('hex');
const uuid = (seed) => {
  const h = hash(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const rid = () => crypto.randomUUID();

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ago = (days, hours = 0) => iso(NOW - days * 86_400_000 - hours * 3_600_000);
const ahead = (days) => iso(NOW + days * 86_400_000);
const money = (value) => value.toFixed(2);

/* ------------------------------------------------------------------ *
 * Branding
 * ------------------------------------------------------------------ */

const branding = {
  brandName: 'Vela Tailor',
  tagline: 'Operations platform for tailoring houses',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#4f46e5',
  accentColor: '#0ea5e9',
  defaultTheme: 'light',
  loginTitle: 'Sign in to your workspace',
  description: 'Orders, measurements, payments and WhatsApp updates for growing tailoring businesses.',
  supportEmail: 'support@velatailor.test',
  supportUrl: 'https://support.velatailor.test',
  footerText: 'Need help? Call +92 300 0000000 or email support.',
};

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

const MODULES = ['customers', 'measurements', 'orders', 'payments', 'catalog', 'notifications', 'reports', 'staff'];
const PAYMENT_METHODS = ['CASH', 'BANK', 'DIGITAL'];
const WIDGETS = ['newOrders', 'dueToday', 'overdue', 'inProgress', 'outstanding', 'collectedToday'];

const NOTIFICATION_KINDS = [
  'ORDER_CREATED', 'PAYMENT_RECEIVED', 'ORDER_READY', 'STATUS_CHANGED', 'PAYMENT_DUE',
  'SUBSCRIPTION_EXPIRING', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'MEASUREMENT_APPENDED',
  'SUBSCRIPTION_PAYMENT_SUBMITTED', 'SUBSCRIPTION_PAYMENT_UNDER_REVIEW',
  'SUBSCRIPTION_PAYMENT_APPROVED', 'SUBSCRIPTION_PAYMENT_REJECTED',
];

function notificationTemplates() {
  const bodies = {
    ORDER_CREATED: 'Hi {{customer}}, your order {{order}} has been created. We will message you when it is ready.',
    PAYMENT_RECEIVED: 'Thank you {{customer}}! We received {{amount}} for order {{order}}.',
    ORDER_READY: 'Hi {{customer}}, your order {{order}} is ready for pickup.',
    STATUS_CHANGED: 'Hi {{customer}}, order {{order}} moved to {{status}}.',
    PAYMENT_DUE: 'Hi {{customer}}, a balance of {{amount}} is due for order {{order}}.',
    SUBSCRIPTION_EXPIRING: 'Your workspace subscription expires on {{date}}. Renew to avoid interruption.',
    CUSTOMER_CREATED: 'Welcome {{customer}}! Your profile is ready with {{business}}.',
    CUSTOMER_UPDATED: 'Hi {{customer}}, your profile details were updated.',
    MEASUREMENT_APPENDED: 'Hi {{customer}}, we saved a new measurement profile for you.',
    SUBSCRIPTION_PAYMENT_SUBMITTED: 'We received your subscription payment {{reference}} and sent it for review.',
    SUBSCRIPTION_PAYMENT_UNDER_REVIEW: 'Your payment {{reference}} is under review.',
    SUBSCRIPTION_PAYMENT_APPROVED: 'Your payment {{reference}} was approved. Thank you!',
    SUBSCRIPTION_PAYMENT_REJECTED: 'We could not approve payment {{reference}}. Reason: {{reason}}',
  };
  return Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, {
    enabled: !kind.startsWith('SUBSCRIPTION_PAYMENT_UNDER'),
    body: bodies[kind] ?? '',
    providerTemplateName: `vela_${kind.toLowerCase()}`,
    language: 'en',
    recipientPolicy: kind.startsWith('SUBSCRIPTION_') ? 'BUSINESS_CONTACT' : 'CUSTOMER',
  }]));
}

function buildStages(key, stages) {
  return stages.map(([stageKey, label, sortOrder], index) => ({
    id: uuid(`${key}:stage:${stageKey}`),
    templateId: uuid(`template:${key}`),
    businessId: null,
    key: stageKey,
    label,
    sortOrder,
    isInitial: index === 0,
    isTerminal: label === 'Completed' || label === 'Cancelled',
    actions: [],
  }));
}

function buildTransitions(key, stages) {
  const built = buildStages(key, stages);
  const transitions = [];
  for (let index = 0; index < built.length - 1; index += 1) {
    const from = built[index];
    const to = built[index + 1];
    if (from.label === 'Cancelled' || to.label === 'Cancelled') continue;
    transitions.push({
      id: uuid(`${key}:tr:${from.key}:${to.key}`),
      templateId: uuid(`template:${key}`),
      businessId: null,
      fromStageId: from.id,
      toStageId: to.id,
      allowedRoleKeys: [],
      actions: [],
    });
  }
  return transitions;
}

const TEMPLATE_DEFS = [
  {
    key: 'tailor',
    name: 'Tailor',
    category: 'SERVICE',
    description: 'Garment orders, measurements, and fittings.',
    terminology: { customer: 'Customer', customers: 'Customers', item: 'Garment', items: 'Garments', measurement: 'Measurement', measurements: 'Measurements', order: 'Order', orders: 'Orders', ready: 'Ready for pickup' },
    enabledModules: ['customers', 'measurements', 'orders', 'payments', 'reports', 'notifications'],
    itemTypes: [{ key: 'garment', label: 'Garment' }],
    stages: [['NEW', 'New', 0], ['MEASUREMENT_CONFIRMED', 'Measurement', 1], ['CUTTING', 'Cutting', 2], ['STITCHING', 'Stitching', 3], ['FINISHING', 'Finishing', 4], ['READY_FOR_PICKUP', 'Ready for pickup', 5], ['COLLECTED', 'Completed', 6], ['CANCELLED', 'Cancelled', 99]],
    fields: [
      ['orders', 'order-item', 'garment_name', 'Garment', 'TEXT', true, 0],
      ['orders', 'order-item', 'quantity', 'Quantity', 'NUMBER', true, 1],
      ['customers', 'customer', 'referral', 'Referral source', 'DROPDOWN', false, 0],
    ],
  },
  {
    key: 'furniture',
    name: 'Furniture',
    category: 'PRODUCT',
    description: 'Custom furniture production and delivery preparation.',
    terminology: { customer: 'Customer', customers: 'Customers', item: 'Furniture Item', items: 'Furniture Items', measurement: 'Dimensions', measurements: 'Dimensions', order: 'Order', orders: 'Orders', ready: 'Ready' },
    enabledModules: ['customers', 'orders', 'payments', 'catalog', 'reports', 'notifications'],
    itemTypes: [{ key: 'furniture_item', label: 'Furniture Item' }],
    stages: [['NEW', 'New', 0], ['DESIGN', 'Design', 1], ['MATERIAL_CONFIRMATION', 'Material Confirmation', 2], ['PRODUCTION', 'Production', 3], ['FINISHING', 'Finishing', 4], ['READY', 'Ready', 5], ['COMPLETED', 'Completed', 6]],
    fields: [['orders', 'order-item', 'dimensions', 'Dimensions', 'MEASUREMENT', true, 0]],
  },
  {
    key: 'carpenter',
    name: 'Carpenter',
    category: 'SERVICE',
    description: 'Carpentry jobs, materials, and dimensions.',
    terminology: { customer: 'Customer', customers: 'Customers', item: 'Project', items: 'Projects', measurement: 'Dimensions', measurements: 'Dimensions', order: 'Job', orders: 'Jobs', ready: 'Ready' },
    enabledModules: ['customers', 'orders', 'payments', 'reports', 'notifications'],
    itemTypes: [{ key: 'project', label: 'Project' }],
    stages: [['NEW', 'New', 0], ['DESIGN', 'Design', 1], ['MATERIAL_CONFIRMATION', 'Material Confirmation', 2], ['PRODUCTION', 'Production', 3], ['FINISHING', 'Finishing', 4], ['READY', 'Ready', 5], ['COMPLETED', 'Completed', 6]],
    fields: [['orders', 'job', 'dimensions', 'Dimensions', 'MEASUREMENT', true, 0]],
  },
  {
    key: 'auto-workshop',
    name: 'Auto Workshop',
    category: 'SERVICE',
    description: 'Vehicle inspection, estimates, and repair jobs.',
    terminology: { customer: 'Customer', customers: 'Customers', item: 'Vehicle', items: 'Vehicles', measurement: 'Inspection', measurements: 'Inspections', order: 'Job', orders: 'Jobs', ready: 'Ready' },
    enabledModules: ['customers', 'orders', 'payments', 'reports', 'notifications'],
    itemTypes: [{ key: 'vehicle', label: 'Vehicle' }],
    stages: [['INSPECTION', 'Inspection', 0], ['ESTIMATE', 'Estimate', 1], ['APPROVED', 'Approved', 2], ['REPAIR', 'Repair', 3], ['QUALITY_CHECK', 'Quality Check', 4], ['READY', 'Ready', 5], ['COMPLETED', 'Completed', 6]],
    fields: [['orders', 'job', 'vehicle', 'Vehicle', 'REFERENCE', true, 0]],
  },
  {
    key: 'printing',
    name: 'Printing',
    category: 'PRODUCT',
    description: 'Print jobs, specifications, and production stages.',
    terminology: { customer: 'Customer', customers: 'Customers', item: 'Print Product', items: 'Print Products', measurement: 'Specification', measurements: 'Specifications', order: 'Job', orders: 'Jobs', ready: 'Ready' },
    enabledModules: ['customers', 'orders', 'payments', 'catalog', 'reports', 'notifications'],
    itemTypes: [{ key: 'print_product', label: 'Print Product' }],
    stages: [['NEW', 'New', 0], ['DESIGN', 'Design', 1], ['PRODUCTION', 'Production', 2], ['FINISHING', 'Finishing', 3], ['READY', 'Ready', 4], ['COMPLETED', 'Completed', 5]],
    fields: [['orders', 'order-item', 'specifications', 'Specifications', 'LONG_TEXT', true, 0]],
  },
  {
    key: 'generic',
    name: 'Generic',
    category: 'GENERAL',
    description: 'A configurable customer, order, and payment workspace.',
    terminology: { customer: 'Customer', customers: 'Customers', item: 'Item', items: 'Items', measurement: 'Details', measurements: 'Details', order: 'Order', orders: 'Orders', ready: 'Ready' },
    enabledModules: ['customers', 'orders', 'payments', 'reports'],
    itemTypes: [{ key: 'item', label: 'Item' }],
    stages: [['NEW', 'New', 0], ['IN_PROGRESS', 'In progress', 1], ['READY', 'Ready', 2], ['COMPLETED', 'Completed', 3]],
    fields: [],
  },
];

function templateFields(key, defs) {
  return defs.map(([module, screen, fieldKey, label, type, required, sortOrder], index) => ({
    id: uuid(`${key}:field:${fieldKey}:${index}`),
    templateId: uuid(`template:${key}`),
    businessId: null,
    module,
    screen,
    key: fieldKey,
    label,
    type,
    required,
    defaultValue: null,
    validation: null,
    options: type === 'DROPDOWN' ? { choices: ['Instagram', 'Walk-in', 'Friend'] } : null,
    visibility: null,
    sortOrder,
    active: true,
  }));
}

const templates = TEMPLATE_DEFS.map((definition) => ({
  id: uuid(`template:${definition.key}`),
  key: definition.key,
  name: definition.name,
  category: definition.category,
  description: definition.description,
  terminology: definition.terminology,
  enabledModules: definition.enabledModules,
  itemTypes: definition.itemTypes,
  paymentMethods: PAYMENT_METHODS,
  dashboardWidgets: WIDGETS,
  isSystem: true,
  active: true,
  fields: templateFields(definition.key, definition.fields),
  workflowStages: buildStages(definition.key, definition.stages),
  workflowTransitions: buildTransitions(definition.key, definition.stages),
}));

const tailorTemplate = templates.find((template) => template.key === 'tailor');

/* ------------------------------------------------------------------ *
 * Business configuration
 * ------------------------------------------------------------------ */

const BUSINESS_ID = uuid('business:stitch-and-co');
const BUSINESS = {
  id: BUSINESS_ID,
  name: 'Stitch & Co. Tailors',
  logoUrl: null,
  type: 'TAILOR',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
};

const measurementFields = [
  ['chest', 'Chest'], ['waist', 'Waist'], ['sleeve', 'Sleeve'], ['length', 'Length'],
  ['shalwar_length', 'Shalwar Length'], ['neck', 'Neck'], ['hip', 'Hip'], ['inseam', 'Inseam'],
  ['outseam', 'Outseam'], ['shoulder', 'Shoulder'],
].map(([key, label], index) => ({
  id: uuid(`measurement-field:${key}`),
  templateId: tailorTemplate.id,
  businessId: null,
  module: 'measurements',
  screen: 'measurement-profile',
  key,
  label,
  type: 'MEASUREMENT',
  required: false,
  defaultValue: '"in"',
  validation: null,
  options: null,
  visibility: { garmentTypes: ['Shalwar Kameez', 'Shirt', 'Pant', 'Waistcoat', 'Suit', 'Custom'] },
  sortOrder: index,
  active: true,
}));

const businessConfiguration = {
  business: BUSINESS,
  template: { id: tailorTemplate.id, key: 'tailor', name: 'Tailor', category: 'SERVICE' },
  itemTypes: tailorTemplate.itemTypes,
  availableModules: MODULES,
  availablePaymentMethods: PAYMENT_METHODS,
  availableDashboardWidgets: WIDGETS,
  terminology: tailorTemplate.terminology,
  enabledModules: ['customers', 'measurements', 'orders', 'payments', 'catalog', 'notifications', 'reports', 'staff'],
  paymentMethods: PAYMENT_METHODS,
  contactPhone: '+92 300 1234567',
  dashboardWidgets: WIDGETS,
  notificationTemplates: notificationTemplates(),
  fields: [...tailorTemplate.fields, ...measurementFields],
  tenantFields: [],
  workflow: {
    stages: tailorTemplate.workflowStages,
    transitions: tailorTemplate.workflowTransitions,
  },
  workflowIsTenantScoped: false,
  version: 12,
  configurationVersion: 12,
  templateVersion: 4,
  cacheVersion: 7,
  publishedAt: ago(9),
};

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

const CUSTOMER_SEED = [
  ['Ayesha Khan', '0300-1112233', 'Prefers collar-less kameez. Silk thread only.', 'Instagram'],
  ['Bilal Ahmed', '0301-2223344', 'Corporate shirts, slim fit.', 'Walk-in'],
  ['Hina Sheikh', '0302-3334455', 'Bridal trousseau — 12 pieces.', 'Friend'],
  ['Usman Tariq', '0303-4445566', 'Waistcoats for wedding season.', 'Instagram'],
  ['Sana Iqbal', '0304-5556677', 'Regular monthly alterations.', 'Walk-in'],
  ['Zaid Farooq', '0305-6667788', 'Three-piece suits, wool.', 'Friend'],
  ['Maryam Nawaz', '0306-7778899', 'Kurti stitching, cotton lawn.', 'Instagram'],
  ['Hamza Saeed', '0307-8889900', 'Sherwani with embroidery.', 'Walk-in'],
  ['Nida Faisal', '0308-9990011', 'School uniform sets for two kids.', 'Friend'],
  ['Imran Baig', '0309-1011122', 'Kurta pajama, summer lawn.', 'Instagram'],
  ['Kiran Abbasi', '0310-2122233', 'Evening gowns — bespoke.', 'Walk-in'],
  ['Fahad Munir', '0311-3233344', 'Trousers and blazers.', 'Friend'],
  ['Rabia Javed', '0312-4344455', 'Dupatta finishing and hemming.', 'Instagram'],
  ['Danish Raza', '0313-5455566', 'Wedding sherwani + waistcoat set.', 'Walk-in'],
  ['Sadia Kamran', '0314-6566677', 'Corporate trousers, two pairs monthly.', 'Friend'],
  ['Junaid Akram', '0315-7677788', 'Kurta + waistcoat, festive.', 'Instagram'],
];

const customers = CUSTOMER_SEED.map(([name, phone, notes, referral], index) => ({
  id: uuid(`customer:${name}`),
  name,
  phone,
  whatsappConsent: index % 3 !== 1,
  whatsappConsentAt: index % 3 !== 1 ? ago(20 + index) : null,
  whatsappOptedOutAt: index % 3 === 1 ? ago(6 + index) : null,
  notes,
  customFields: { referral },
  version: 1,
  createdAt: ago(40 + index * 3, index % 8),
}));

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

const CATALOG_SEED = [
  ['garment', 'Shalwar Kameez', 'Two-piece stitching, standard finishing.', 'SKU-SK-01', 'piece', 3500],
  ['garment', 'Three-Piece Suit', 'Coat, waistcoat and trouser with fittings.', 'SKU-TS-02', 'piece', 12500],
  ['garment', 'Sherwani', 'Embroidered sherwani with hand work.', 'SKU-SH-03', 'piece', 18000],
  ['garment', 'Waistcoat', 'Formal waistcoat, lined.', 'SKU-WC-04', 'piece', 4200],
  ['garment', 'Kurta Pajama', 'Summer lawn kurta with pajama.', 'SKU-KP-05', 'piece', 2800],
  ['garment', 'Blazer', 'Structured blazer, half canvas.', 'SKU-BZ-06', 'piece', 9800],
  ['garment', 'Trouser', 'Formal trouser, crease resistant.', 'SKU-TR-07', 'piece', 2200],
  ['garment', 'Bridal Gown', 'Bespoke gown with fittings.', 'SKU-BG-08', 'piece', 32000],
  ['garment', 'Alteration', 'Per-garment alteration service.', 'SKU-AL-09', 'piece', 600],
];

const catalogItems = CATALOG_SEED.map(([typeKey, name, description, sku, unit, unitPrice], index) => ({
  id: uuid(`catalog:${sku}`),
  businessId: BUSINESS_ID,
  typeKey,
  name,
  description,
  sku,
  unit,
  unitPrice: money(unitPrice),
  sortOrder: index,
  version: 1,
  active: index !== 8,
  createdAt: ago(80 - index * 2),
  updatedAt: ago(10 + index),
  customFields: {},
}));

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

const GARMENTS = [
  ['Shalwar Kameez', 2, 3500], ['Three-Piece Suit', 1, 12500], ['Sherwani', 1, 18000],
  ['Waistcoat', 2, 4200], ['Kurta Pajama', 3, 2800], ['Blazer', 1, 9800],
  ['Trouser', 2, 2200], ['Bridal Gown', 1, 32000], ['Shirt', 4, 1800],
];
const STAGE_CYCLE = ['NEW', 'MEASUREMENT_CONFIRMED', 'CUTTING', 'STITCHING', 'FINISHING', 'READY_FOR_PICKUP', 'COLLECTED', 'STITCHING', 'FINISHING', 'CUTTING', 'NEW', 'READY_FOR_PICKUP'];

const orders = Array.from({ length: 28 }, (_, index) => {
  const customer = customers[index % customers.length];
  const [garmentName, quantity, unitPrice] = GARMENTS[index % GARMENTS.length];
  const stageKey = index === 26 ? 'CANCELLED' : STAGE_CYCLE[index % STAGE_CYCLE.length];
  const stage = tailorTemplate.workflowStages.find((item) => item.key === stageKey);
  const total = quantity * unitPrice;
  const paidRatio = stageKey === 'COLLECTED' ? 1 : index % 4 === 0 ? 0 : index % 3 === 0 ? 0.5 : 0.25;
  const paid = Math.round(total * paidRatio);
  const createdDaysAgo = Math.round((index + 1) * 4.6) + (index % 5);
  return {
    id: uuid(`order:${index + 1}`),
    orderNumber: `ORD-${String(1043 + index).padStart(5, '0')}`,
    status: stageKey === 'CANCELLED' ? 'CANCELLED' : stageKey === 'COLLECTED' ? 'COMPLETED' : 'IN_PROGRESS',
    workflowStageId: stage.id,
    workflowStageKey: stage.key,
    currentWorkflowStage: stage,
    version: 2,
    total: money(total),
    paid: money(paid),
    outstanding: money(total - paid),
    promisedAt: ahead(index % 6 === 0 ? -3 : 2 + (index % 9)),
    createdAt: ago(createdDaysAgo, index % 9),
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    customFields: { delivery: index % 3 === 0 ? 'Home delivery' : 'Store pickup' },
    items: [{
      id: uuid(`order-item:${index + 1}`),
      garmentName,
      itemName: garmentName,
      itemTypeKey: 'garment',
      quantity,
      unitPrice: money(unitPrice),
      measurementSnapshot: { chest: 38 + (index % 6), waist: 32 + (index % 5), sleeve: 23 + (index % 3), length: 38 + (index % 4) },
      customFields: { fabric: index % 2 === 0 ? 'Customer supplied' : 'House lawn' },
    }],
  };
});

/* ------------------------------------------------------------------ *
 * Measurement profiles
 * ------------------------------------------------------------------ */

const measurementTemplates = [
  {
    id: uuid('measurement-template:shalwar-kameez'),
    name: 'Shalwar Kameez',
    fields: measurementFields.filter((field) => ['chest', 'waist', 'sleeve', 'length', 'shalwar_length'].includes(field.key))
      .map(({ key, label, ...rest }) => ({ key, label, unit: 'in', required: false })),
  },
  {
    id: uuid('measurement-template:shirt'),
    name: 'Shirt',
    fields: measurementFields.filter((field) => ['chest', 'waist', 'neck', 'sleeve', 'length'].includes(field.key))
      .map(({ key, label }) => ({ key, label, unit: 'in', required: false })),
  },
  {
    id: uuid('measurement-template:suit'),
    name: 'Three-Piece Suit',
    fields: measurementFields.filter((field) => ['chest', 'waist', 'shoulder', 'sleeve', 'inseam', 'outseam'].includes(field.key))
      .map(({ key, label }) => ({ key, label, unit: 'in', required: false })),
  },
];

function profileFor(customer) {
  const index = customers.indexOf(customer);
  return measurementTemplates.map((template, templateIndex) => ({
    id: uuid(`profile:${customer.id}:${template.id}`),
    garmentTemplate: {
      id: template.id,
      name: template.name,
      fields: template.fields,
    },
    revisions: Array.from({ length: 1 + ((index + templateIndex) % 3) }, (_, revisionIndex) => ({
      id: uuid(`revision:${customer.id}:${template.id}:${revisionIndex}`),
      version: revisionIndex + 1,
      values: Object.fromEntries(template.fields.map((field, fieldIndex) => [field.key, 30 + fieldIndex * 2 + ((index + revisionIndex) % 5)])),
      notes: revisionIndex === 0 ? 'Initial fitting' : `Updated after fitting ${revisionIndex}`,
      measuredAt: ago(30 + index * 2 + revisionIndex * 12),
    })),
  }));
}

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

const payments = orders.filter((_, index) => index % 2 === 0).flatMap((order, index) => {
  const amount = Number(order.paid) || 1500;
  return [{
    id: uuid(`payment:${order.id}`),
    receiptNumber: `RCP-${String(2201 + index).padStart(5, '0')}`,
    amount: money(amount),
    method: ['CASH', 'BANK', 'DIGITAL'][index % 3],
    kind: 'PAYMENT',
    createdAt: ago(Math.max(1, 40 - index * 3), index % 7),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      customer: order.customer,
    },
  }];
});

function receiptFor(paymentId) {
  const payment = payments.find((item) => item.id === paymentId) ?? payments[0];
  return {
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    amount: payment.amount,
    method: payment.method,
    kind: payment.kind,
    createdAt: payment.createdAt,
    business: { name: BUSINESS.name, timezone: BUSINESS.timezone, currency: BUSINESS.currency },
    order: {
      orderNumber: payment.order.orderNumber,
      customer: { name: payment.order.customer.name, phone: payment.order.customer.phone },
    },
    correctionOf: null,
  };
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

const notifications = Array.from({ length: 14 }, (_, index) => {
  const order = orders[index % orders.length];
  const kind = NOTIFICATION_KINDS[index % 5];
  const status = ['DELIVERED', 'SENT', 'READ', 'FAILED', 'QUEUED'][index % 5];
  return {
    id: uuid(`notification:${index}`),
    customerId: order.customer.id,
    orderId: order.id,
    paymentId: null,
    recipientName: order.customer.name,
    kind,
    status,
    recipientPhone: order.customer.phone,
    templateName: `vela_${kind.toLowerCase()}`,
    attemptCount: status === 'FAILED' ? 2 : 1,
    lastError: status === 'FAILED' ? 'Recipient number is not on WhatsApp' : null,
    renderedMessage: `Hi ${order.customer.name.split(' ')[0]}, your order ${order.orderNumber} is being stitched. We will message you when it is ready.`,
    sentAt: status === 'QUEUED' ? null : ago(index + 1, index % 6),
    deliveredAt: status === 'DELIVERED' || status === 'READ' ? ago(index + 1, index % 6) : null,
    readAt: status === 'READ' ? ago(index, index % 6) : null,
    failedAt: status === 'FAILED' ? ago(index + 1) : null,
    createdAt: ago(index + 1, index % 6),
    updatedAt: ago(index, index % 6),
  };
});

/* ------------------------------------------------------------------ *
 * Business staff & roles
 * ------------------------------------------------------------------ */

const businessPermissions = [
  ['customers:read', 'View customers'],
  ['customers:write', 'Create and update customers'],
  ['measurements:read', 'View measurements'],
  ['measurements:write', 'Create measurement revisions'],
  ['orders:read', 'View orders'],
  ['orders:write', 'Create orders'],
  ['orders:transition', 'Advance order workflow'],
  ['payments:read', 'View payments'],
  ['payments:write', 'Record payments'],
  ['notifications:read', 'View customer notification delivery history'],
  ['reports:read', 'View business reports'],
  ['audit:read', 'View business audit history'],
  ['staff:manage', 'Manage business staff'],
  ['settings:manage', 'Manage business settings'],
  ['subscriptions:read', 'View subscription and payment history'],
  ['subscriptions:manage', 'Request plans and submit subscription payments'],
];

const ALL_BUSINESS_PERMISSIONS = businessPermissions.map(([key]) => key);

const businessRoles = [
  { id: uuid('role:owner'), name: 'Owner', isSystem: true, permissions: ALL_BUSINESS_PERMISSIONS, memberCount: 1 },
  { id: uuid('role:manager'), name: 'Shop manager', isSystem: false, permissions: ALL_BUSINESS_PERMISSIONS.filter((key) => !key.startsWith('settings:') && key !== 'staff:manage'), memberCount: 2 },
  { id: uuid('role:tailor'), name: 'Tailor', isSystem: false, permissions: ['orders:read', 'orders:transition', 'measurements:read', 'customers:read'], memberCount: 4 },
  { id: uuid('role:cashier'), name: 'Cashier', isSystem: false, permissions: ['orders:read', 'payments:read', 'payments:write', 'customers:read', 'customers:write'], memberCount: 1 },
];

const businessMembers = [
  ['Sana Iqbal', 'sana@stitch.test', 'Owner'],
  ['Kamran Sethi', 'kamran@stitch.test', 'Shop manager'],
  ['Nabeel Hussain', 'nabeel@stitch.test', 'Tailor'],
  ['Irfan Ali', 'irfan@stitch.test', 'Tailor'],
  ['Sadia Kamran', 'sadia@stitch.test', 'Cashier'],
].map(([name, email, roleName], index) => ({
  id: uuid(`membership:${email}`),
  active: index !== 4,
  createdAt: ago(60 - index * 4),
  user: { id: uuid(`user:${email}`), name, email, active: true },
  role: (() => { const role = businessRoles.find((item) => item.name === roleName); return { id: role.id, name: role.name }; })(),
}));

/* ------------------------------------------------------------------ *
 * Subscriptions (business side)
 * ------------------------------------------------------------------ */

const subscriptionPlans = [
  {
    id: uuid('plan:starter'),
    name: 'Starter',
    description: 'For a single tailor shop getting organised.',
    monthlyPrice: '2500.00',
    yearlyPrice: '25000.00',
    currency: 'PKR',
    trialDays: 14,
    features: { customers: true, measurements: true, orders: true, payments: true, catalog: false, notifications: false, staff: false, reports: false },
    limits: { customers: 250, staff: 2, ordersPerMonth: 200, catalogItems: -1 },
    active: true,
    isDefault: true,
    _count: { subscriptions: 6, payments: 12 },
  },
  {
    id: uuid('plan:growth'),
    name: 'Growth',
    description: 'Multi-staff shops with reminders and reporting.',
    monthlyPrice: '6000.00',
    yearlyPrice: '60000.00',
    currency: 'PKR',
    trialDays: 14,
    features: { customers: true, measurements: true, orders: true, payments: true, catalog: true, notifications: true, staff: true, reports: true },
    limits: { customers: -1, staff: 10, ordersPerMonth: -1, catalogItems: 500 },
    active: true,
    isDefault: false,
    _count: { subscriptions: 3, payments: 9 },
  },
  {
    id: uuid('plan:enterprise'),
    name: 'Enterprise',
    description: 'Chains and franchises with bespoke workflows.',
    monthlyPrice: '18000.00',
    yearlyPrice: '180000.00',
    currency: 'PKR',
    trialDays: 30,
    features: { customers: true, measurements: true, orders: true, payments: true, catalog: true, notifications: true, staff: true, reports: true },
    limits: { customers: -1, staff: -1, ordersPerMonth: -1, catalogItems: -1 },
    active: true,
    isDefault: false,
    _count: { subscriptions: 1, payments: 4 },
  },
];

const businessSubscription = {
  id: uuid('subscription:stitch-and-co'),
  businessId: BUSINESS_ID,
  planId: subscriptionPlans[1].id,
  status: 'ACTIVE',
  cycle: 'MONTHLY',
  startsAt: ago(64),
  endsAt: ahead(26),
  graceUntil: ahead(33),
  customPrice: null,
  discountAmount: '0.00',
  complimentary: false,
  grandfathered: false,
  createdAt: ago(64),
  plan: subscriptionPlans[1],
};

const businessSubscriptionPayments = [
  ['TXN-88213', 'Kamran Sethi', '6000.00', 'BANK', 34, 'APPROVED'],
  ['TXN-81664', 'Kamran Sethi', '6000.00', 'BANK', 64, 'APPROVED'],
  ['TXN-77120', 'Kamran Sethi', '6000.00', 'DIGITAL', 95, 'APPROVED'],
].map(([transactionReference, senderName, amount, method, days, status], index) => ({
  id: uuid(`subscription-payment:stitch:${index}`),
  businessId: BUSINESS_ID,
  planId: subscriptionPlans[1].id,
  subscriptionId: businessSubscription.id,
  status,
  cycle: 'MONTHLY',
  transactionReference,
  senderName,
  amount,
  method,
  paymentDate: ago(days),
  invoiceNumber: `INV-${1200 + index}`,
  rejectionReason: null,
  reviewedAt: ago(days - 1),
  createdAt: ago(days),
  plan: { name: 'Growth' },
  business: { id: BUSINESS_ID, name: BUSINESS.name, slug: 'stitch-and-co' },
}));

/* ------------------------------------------------------------------ *
 * Platform
 * ------------------------------------------------------------------ */

const PLATFORM_BUSINESS_SEED = [
  ['Stitch & Co. Tailors', 'stitch-and-co', 'ACTIVE', 'tailor', 6, 5, 'Sana Iqbal', 2],
  ['Kamalia Fabrics', 'kamalia-fabrics', 'ACTIVE', 'tailor', 41, 9, 'Rizwan Kamalia', 4],
  ['Lahore Couture House', 'lahore-couture', 'ACTIVE', 'tailor', 118, 22, 'Ayesha Kamran', 6],
  ['Woodline Interiors', 'woodline-interiors', 'ACTIVE', 'furniture', 26, 8, 'Danish Raza', 3],
  ['Karachi Carpentry Co.', 'karachi-carpentry', 'ACTIVE', 'carpenter', 19, 6, 'Imran Baig', 2],
  ['Print Hub Express', 'print-hub-express', 'ACTIVE', 'printing', 33, 11, 'Nida Faisal', 4],
  ['MotorCare Workshop', 'motorcare-workshop', 'PENDING', 'auto-workshop', 210, 0, null, 0],
  ['Islamabad Stitchery', 'islamabad-stitchery', 'PENDING', 'tailor', 138, 0, null, 0],
  ['Faisalabad Garments', 'faisalabad-garments', 'SUSPENDED', 'tailor', 87, 3, 'Hamza Saeed', 1],
  ['Multan Dress Makers', 'multan-dress-makers', 'ACTIVE', 'tailor', 54, 7, 'Kiran Abbasi', 3],
];

const platformBusinesses = PLATFORM_BUSINESS_SEED.map(([name, slug, status, templateKey, days, members, ownerName, activeMemberships], index) => {
  const template = templates.find((item) => item.key === templateKey);
  return {
    id: uuid(`platform-business:${slug}`),
    name,
    slug,
    status,
    createdAt: ago(days),
    template: { id: template.id, key: template.key, name: template.name },
    _count: { memberships: members },
    owner: ownerName ? { id: uuid(`owner:${slug}`), name: ownerName, email: `${ownerName.split(' ')[0].toLowerCase()}@${slug}.test` } : null,
    activeMemberships,
  };
});

const platformPermissions = [
  ['platform:businesses:read', 'View all businesses'],
  ['platform:businesses:manage', 'Create, activate and suspend businesses'],
  ['platform:templates:manage', 'Create and customize business templates'],
  ['platform:staff:manage', 'Manage platform staff and their explicit grants'],
  ['platform:audit:read', 'View platform-wide audit history'],
  ['platform:system:health', 'View platform system health'],
  ['platform:subscriptions:read', 'View subscription dashboard and business subscriptions'],
  ['platform:plans:manage', 'Manage subscription plans'],
  ['platform:payments:review', 'Review subscription payment submissions'],
  ['platform:subscriptions:manage', 'Manage business subscription lifecycle'],
  ['platform:billing:settings', 'Manage billing instructions and settings'],
  ['platform:application:manage', 'Manage global product branding and appearance'],
  ['platform:reports:read', 'View subscription and payment reports'],
];

const ALL_PLATFORM_PERMISSIONS = platformPermissions.map(([key]) => key);

const platformStaff = [
  { id: uuid('platform-staff:sarah'), name: 'Sarah Rahman', email: 'sarah@vela.test', active: true, permissions: ALL_PLATFORM_PERMISSIONS.filter((key) => key !== 'platform:application:manage') },
  { id: uuid('platform-staff:omer'), name: 'Omer Farooq', email: 'omer@vela.test', active: true, permissions: ['platform:businesses:read', 'platform:subscriptions:read', 'platform:payments:review', 'platform:reports:read'] },
  { id: uuid('platform-staff:leena'), name: 'Leena Tariq', email: 'leena@vela.test', active: false, permissions: ['platform:audit:read', 'platform:system:health'] },
];

const AUDIT_ACTIONS = [
  ['platform.business_created', 'business'], ['platform.business_activated', 'business'],
  ['platform.subscription_assigned', 'subscription'], ['platform.payment_approved', 'subscription_payment'],
  ['platform.staff_permissions_changed', 'user'], ['platform.template_updated', 'business_template'],
  ['platform.branding_updated', 'application_branding'], ['platform.business_suspended', 'business'],
  ['platform.plan_updated', 'subscription_plan'], ['platform.payment_rejected', 'subscription_payment'],
  ['platform.business_owner_assigned', 'membership'], ['platform.billing_settings_updated', 'billing_settings'],
];

const auditEvents = Array.from({ length: 18 }, (_, index) => {
  const [action, entityType] = AUDIT_ACTIONS[index % AUDIT_ACTIONS.length];
  const actor = index % 4 === 0 ? null : { id: uuid('user:super'), name: 'Platform Super Admin', email: 'admin@vela.test' };
  return {
    id: uuid(`audit:${index}`),
    businessId: index % 3 === 0 ? platformBusinesses[index % platformBusinesses.length].id : null,
    actorId: actor?.id ?? null,
    action,
    entityType,
    entityId: uuid(`entity:${index}`),
    metadata: { source: 'platform-console', index },
    requestId: rid(),
    createdAt: ago(index * 0.7, index % 12),
    actor,
  };
});

const platformSubscriptionPayments = [
  ['TXN-90001', 'Rizwan Kamalia', '6000.00', 'BANK', 1, 'PENDING', 'kamalia-fabrics', 'Growth'],
  ['TXN-90002', 'Ayesha Kamran', '18000.00', 'BANK', 2, 'UNDER_REVIEW', 'lahore-couture', 'Enterprise'],
  ['TXN-90003', 'Danish Raza', '2500.00', 'DIGITAL', 3, 'PENDING', 'woodline-interiors', 'Starter'],
  ['TXN-90004', 'Imran Baig', '6000.00', 'CASH', 4, 'APPROVED', 'karachi-carpentry', 'Growth'],
  ['TXN-90005', 'Nida Faisal', '6000.00', 'BANK', 8, 'APPROVED', 'print-hub-express', 'Growth'],
  ['TXN-90006', 'Hamza Saeed', '2500.00', 'DIGITAL', 11, 'REJECTED', 'faisalabad-garments', 'Starter'],
  ['TXN-90007', 'Kiran Abbasi', '18000.00', 'BANK', 14, 'APPROVED', 'multan-dress-makers', 'Enterprise'],
  ['TXN-90008', 'Sana Iqbal', '6000.00', 'BANK', 19, 'APPROVED', 'stitch-and-co', 'Growth'],
].map(([transactionReference, senderName, amount, method, days, status, slug, planName], index) => {
  const business = platformBusinesses.find((item) => item.slug === slug);
  return {
    id: uuid(`platform-payment:${index}`),
    businessId: business.id,
    planId: subscriptionPlans.find((plan) => plan.name === planName).id,
    subscriptionId: uuid(`platform-subscription:${slug}`),
    status,
    cycle: 'MONTHLY',
    transactionReference,
    senderName,
    amount,
    method,
    paymentDate: ago(days),
    invoiceNumber: `INV-${4300 + index}`,
    rejectionReason: status === 'REJECTED' ? 'Reference does not match a bank deposit.' : null,
    reviewedAt: ['APPROVED', 'REJECTED'].includes(status) ? ago(days - 1) : null,
    createdAt: ago(days),
    plan: { name: planName },
    business: { id: business.id, name: business.name, slug: business.slug },
    submittedBy: { name: senderName, email: `${senderName.split(' ')[0].toLowerCase()}@${slug}.test` },
    reviewedBy: ['APPROVED', 'REJECTED'].includes(status) ? { name: 'Platform Super Admin', email: 'admin@vela.test' } : null,
    subscription: { startsAt: ago(days + 26), endsAt: ahead(30 - days) },
  };
});

const billingSettings = {
  paymentMethods: ['Bank transfer', 'JazzCash', 'EasyPaisa'],
  paymentInstructions: 'Send the subscription amount to Meezan Bank · Title: Vela Technologies · Account 0214-0100-9981. Add your shop slug as the transfer reference, then submit the transaction details above for review.',
  gracePeriodDays: 7,
  expiryReminderDays: [7, 3, 1],
  enforcementEnabled: true,
  supportContact: 'WhatsApp +92 300 0000000 · support@velatailor.test',
};

const billingDashboard = {
  businesses: platformBusinesses.length,
  active: platformBusinesses.filter((business) => business.status === 'ACTIVE').length,
  trial: 1,
  complimentary: 2,
  expired: platformBusinesses.filter((business) => business.status === 'SUSPENDED').length,
  pendingPayments: platformSubscriptionPayments.filter((payment) => payment.status === 'PENDING').length,
  recordedRevenue: money(platformSubscriptionPayments.filter((payment) => payment.status === 'APPROVED')
    .reduce((total, payment) => total + Number(payment.amount), 0)),
  approvedPaymentCount: platformSubscriptionPayments.filter((payment) => payment.status === 'APPROVED').length,
  expiring: platformBusinesses.filter((business) => business.status === 'ACTIVE').slice(0, 5).map((business, index) => ({
    id: uuid(`expiring:${business.slug}`),
    endsAt: ahead(index + 2),
    business: { id: business.id, name: business.name },
    plan: { name: subscriptionPlans[index % subscriptionPlans.length].name },
  })),
};

/* ------------------------------------------------------------------ *
 * Session helpers
 * ------------------------------------------------------------------ */

const SUPER_ADMIN = {
  id: uuid('user:super'),
  name: 'Platform Super Admin',
  email: 'admin@vela.test',
  platformRole: 'SUPER_ADMIN',
};
const BUSINESS_OWNER = {
  id: uuid('user:owner'),
  name: 'Sana Iqbal',
  email: 'sana@stitch.test',
  platformRole: null,
};

const sessions = new Map();
const makeToken = (scope, businessId) => {
  const token = `demo.${scope}.${crypto.randomBytes(6).toString('hex')}`;
  sessions.set(token, { scope, businessId, refresh: `refresh.${token}` });
  return token;
};
const sessionFor = (token) => sessions.get(String(token).trim());

function businessContext(token) {
  const session = sessionFor(token);
  const business = platformBusinesses.find((item) => item.id === session?.businessId) ?? platformBusinesses[0];
  return {
    user: BUSINESS_OWNER,
    context: {
      scope: 'business',
      business: { id: BUSINESS_ID, name: BUSINESS.name, slug: business.slug, timezone: BUSINESS.timezone },
      permissions: ALL_BUSINESS_PERMISSIONS,
      platformPermissions: [],
    },
  };
}

function platformContext() {
  return {
    user: SUPER_ADMIN,
    context: {
      scope: 'platform',
      permissions: [],
      platformPermissions: ALL_PLATFORM_PERMISSIONS,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

const routes = [];
const on = (method, pattern, handler) => routes.push({ method, pattern: pattern.split('/').filter(Boolean), handler });

const send = (res, status, payload, headers = {}) => {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': rid(),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type,idempotency-key',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    ...headers,
  });
  res.end(body);
};
const ok = (res, data) => send(res, 200, { data });
const created = (res, data) => send(res, 201, { data });
const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

/* --- auth --- */

on('POST', '/auth/login', (req, res) => {
  const { email = '', scope, businessId } = req.body ?? {};
  const wantsPlatform = scope === 'platform' || /platform|admin@/.test(String(email));
  if (wantsPlatform) {
    const accessToken = makeToken('platform');
    return ok(res, { user: SUPER_ADMIN, accessToken, refreshToken: sessions.get(accessToken).refresh });
  }
  if (!scope) {
    return ok(res, {
      requiresScopeSelection: true,
      canAccessPlatform: false,
      businesses: [{ id: BUSINESS_ID, name: BUSINESS.name }],
    });
  }
  if (scope === 'business' && !businessId) {
    return ok(res, { requiresBusinessSelection: true, businesses: [{ id: BUSINESS_ID, name: BUSINESS.name }] });
  }
  const accessToken = makeToken('business', businessId ?? BUSINESS_ID);
  return ok(res, { user: BUSINESS_OWNER, business: { id: BUSINESS_ID, name: BUSINESS.name }, accessToken, refreshToken: sessions.get(accessToken).refresh });
});

on('POST', '/auth/refresh', (req, res) => {
  const scope = String(req.body?.refreshToken ?? '').includes('platform') ? 'platform' : 'business';
  const accessToken = makeToken(scope, BUSINESS_ID);
  return ok(res, { accessToken, refreshToken: sessions.get(accessToken).refresh });
});

on('POST', '/auth/logout', (_req, res) => ok(res, { revoked: true }));

on('GET', '/auth/me', (req, res) => {
  const session = sessionFor(req.token);
  if (!session) return fail(res, 401, 'INVALID_TOKEN', 'Access token is invalid or expired');
  return ok(res, session.scope === 'platform' ? platformContext() : businessContext(req.token));
});

on('GET', '/public/application-branding', (_req, res) => ok(res, branding));
on('GET', '/platform/application-branding', (_req, res) => ok(res, branding));
on('PUT', '/platform/application-branding', (req, res) => {
  Object.assign(branding, req.body ?? {});
  return ok(res, branding);
});

/* --- business data --- */

on('GET', '/reports/dashboard', (_req, res) => ok(res, {
  newOrders: 7,
  dueToday: 4,
  overdue: 3,
  inProgress: 11,
  alterations: 5,
  outstanding: '184500.00',
  collectedToday: '26800.00',
  asOf: new Date().toISOString(),
}));

on('GET', '/customers', (req, res) => {
  const q = String(req.query.get('q') ?? '').trim().toLowerCase();
  const items = q
    ? customers.filter((customer) => customer.name.toLowerCase().includes(q) || customer.phone.includes(q))
    : customers;
  return ok(res, { items, nextCursor: null });
});

on('POST', '/customers', (req, res) => {
  const input = req.body ?? {};
  const customer = {
    id: rid(),
    name: input.name ?? 'New customer',
    phone: input.phone ?? '0300-0000000',
    whatsappConsent: Boolean(input.whatsappConsent),
    whatsappConsentAt: input.whatsappConsent ? new Date().toISOString() : null,
    whatsappOptedOutAt: null,
    notes: input.notes ?? null,
    customFields: input.customFields ?? {},
    version: 1,
    createdAt: new Date().toISOString(),
  };
  customers.unshift(customer);
  return created(res, customer);
});

on('PATCH', '/customers/:id/whatsapp-consent', (req, res) => {
  const customer = customers.find((item) => item.id === req.params.id);
  if (!customer) return fail(res, 404, 'NOT_FOUND', 'Customer not found');
  customer.whatsappConsent = Boolean(req.body?.consent);
  customer.whatsappConsentAt = customer.whatsappConsent ? new Date().toISOString() : customer.whatsappConsentAt;
  customer.whatsappOptedOutAt = customer.whatsappConsent ? null : new Date().toISOString();
  return ok(res, customer);
});

on('GET', '/catalog', (_req, res) => ok(res, { items: catalogItems, nextCursor: null }));
on('POST', '/catalog', (req, res) => {
  const item = {
    id: rid(),
    businessId: BUSINESS_ID,
    typeKey: req.body?.typeKey ?? 'garment',
    name: req.body?.name ?? 'New item',
    description: req.body?.description ?? null,
    sku: req.body?.sku ?? null,
    unit: req.body?.unit ?? 'piece',
    unitPrice: req.body?.unitPrice ?? '0.00',
    sortOrder: catalogItems.length,
    version: 1,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customFields: req.body?.customFields ?? {},
  };
  catalogItems.push(item);
  return created(res, item);
});
on('PATCH', '/catalog/:id', (req, res) => {
  const item = catalogItems.find((entry) => entry.id === req.params.id);
  if (!item) return fail(res, 404, 'NOT_FOUND', 'Catalog item not found');
  Object.assign(item, req.body ?? {}, { updatedAt: new Date().toISOString() });
  return ok(res, item);
});

on('GET', '/orders', (_req, res) => ok(res, { items: orders, nextCursor: null }));
on('POST', '/orders', (req, res) => {
  const order = { ...orders[0], id: rid(), orderNumber: `ORD-${2000 + orders.length}`, version: 1, createdAt: new Date().toISOString(), ...(req.body ?? {}) };
  orders.unshift(order);
  return created(res, order);
});
on('PATCH', '/orders/:id/status', (req, res) => {
  const order = orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, 'NOT_FOUND', 'Order not found');
  order.status = req.body?.status ?? order.status;
  return ok(res, order);
});
on('PATCH', '/orders/:id/workflow', (req, res) => {
  const order = orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, 'NOT_FOUND', 'Order not found');
  const stage = tailorTemplate.workflowStages.find((item) => item.key === req.body?.stageKey) ?? order.currentWorkflowStage;
  order.currentWorkflowStage = stage;
  order.workflowStageId = stage.id;
  order.workflowStageKey = stage.key;
  return ok(res, order);
});

on('GET', '/measurements/templates', (_req, res) => ok(res, { items: measurementTemplates }));
on('GET', '/measurements/customers/:id', (req, res) => {
  const customer = customers.find((item) => item.id === req.params.id) ?? customers[0];
  return ok(res, { items: profileFor(customer) });
});
on('POST', '/measurements/customers/:id/revisions', (req, res) => {
  const customer = customers.find((item) => item.id === req.params.id) ?? customers[0];
  const template = measurementTemplates.find((item) => item.id === req.body?.garmentTemplateId) ?? measurementTemplates[0];
  const revision = {
    id: rid(),
    version: 4,
    values: req.body?.values ?? {},
    notes: req.body?.notes ?? null,
    measuredAt: new Date().toISOString(),
  };
  return created(res, { profile: { id: uuid(`profile:${customer.id}:${template.id}`) }, revision });
});

on('GET', '/business/configuration', (_req, res) => ok(res, businessConfiguration));
on('PUT', '/business/configuration', (req, res) => {
  const input = req.body ?? {};
  if (input.business) Object.assign(businessConfiguration.business, input.business);
  if (input.enabledModules) businessConfiguration.enabledModules = input.enabledModules;
  if (input.paymentMethods) businessConfiguration.paymentMethods = input.paymentMethods;
  if (input.dashboardWidgets) businessConfiguration.dashboardWidgets = input.dashboardWidgets;
  if (input.notificationTemplates) Object.assign(businessConfiguration.notificationTemplates, input.notificationTemplates);
  if ('contactPhone' in input) businessConfiguration.contactPhone = input.contactPhone;
  businessConfiguration.version += 1;
  return send(res, 200, { data: {} });
});
on('PUT', '/business/configuration/structure', (_req, res) => ok(res, { version: businessConfiguration.version + 1, templateVersion: businessConfiguration.templateVersion }));
on('GET', '/business/configuration/history', (_req, res) => ok(res, {
  items: Array.from({ length: 6 }, (_, index) => ({
    id: uuid(`config-history:${index}`),
    actorName: index % 2 === 0 ? 'Sana Iqbal' : 'Kamran Sethi',
    version: 12 - index,
    templateVersion: 4,
    snapshot: null,
    createdAt: ago(index * 6 + 1),
  })),
  nextCursor: null,
}));

on('GET', '/business/permissions', (_req, res) => ok(res, { items: businessPermissions.map(([key, description]) => ({ key, description })) }));
on('GET', '/business/roles', (_req, res) => ok(res, { items: businessRoles }));
on('POST', '/business/roles', (req, res) => {
  const role = { id: rid(), name: req.body?.name ?? 'New role', isSystem: false, permissions: req.body?.permissions ?? [], memberCount: 0 };
  businessRoles.push(role);
  return created(res, role);
});
on('PATCH', '/business/roles/:id', (req, res) => {
  const role = businessRoles.find((item) => item.id === req.params.id);
  if (!role) return fail(res, 404, 'NOT_FOUND', 'Role not found');
  Object.assign(role, req.body ?? {});
  return ok(res, role);
});
on('DELETE', '/business/roles/:id', (_req, res) => send(res, 200, { data: {} }));

on('GET', '/business/staff', (_req, res) => ok(res, { items: businessMembers }));
on('POST', '/business/staff', (req, res) => {
  const role = businessRoles.find((item) => item.id === req.body?.roleId) ?? businessRoles[0];
  const member = {
    id: rid(),
    active: true,
    createdAt: new Date().toISOString(),
    user: { id: rid(), name: req.body?.name ?? 'New member', email: req.body?.email ?? 'member@stitch.test', active: true },
    role: { id: role.id, name: role.name },
  };
  businessMembers.push(member);
  return created(res, member);
});
on('PATCH', '/business/staff/:id', (req, res) => {
  const member = businessMembers.find((item) => item.id === req.params.id);
  if (!member) return fail(res, 404, 'NOT_FOUND', 'Member not found');
  if (req.body?.roleId) {
    const role = businessRoles.find((item) => item.id === req.body.roleId);
    if (role) member.role = { id: role.id, name: role.name };
  }
  if (typeof req.body?.active === 'boolean') member.active = req.body.active;
  return ok(res, member);
});
on('DELETE', '/business/staff/:id', (req, res) => {
  const member = businessMembers.find((item) => item.id === req.params.id);
  if (!member) return fail(res, 404, 'NOT_FOUND', 'Member not found');
  member.active = false;
  return ok(res, member);
});

on('GET', '/payments', (_req, res) => ok(res, { items: payments, nextCursor: null }));
on('POST', '/payments/orders/:orderId', (req, res) => {
  const order = orders.find((item) => item.id === req.params.orderId) ?? orders[0];
  const payment = {
    id: rid(),
    receiptNumber: `RCP-${3000 + payments.length}`,
    amount: req.body?.amount ?? '0.00',
    method: req.body?.method ?? 'CASH',
    kind: 'PAYMENT',
    createdAt: new Date().toISOString(),
  };
  payments.unshift({ ...payment, order: { id: order.id, orderNumber: order.orderNumber, customer: order.customer } });
  return created(res, payment);
});
on('GET', '/payments/:id/receipt', (req, res) => ok(res, receiptFor(req.params.id)));

on('GET', '/notifications', (_req, res) => ok(res, { items: notifications }));

on('GET', '/subscriptions', (_req, res) => ok(res, {
  items: [businessSubscription],
  payments: businessSubscriptionPayments,
  plans: subscriptionPlans,
  events: auditEvents.slice(0, 6),
}));
on('POST', '/subscriptions/payments', (req, res) => {
  const payment = {
    id: rid(),
    businessId: BUSINESS_ID,
    planId: req.body?.planId ?? subscriptionPlans[1].id,
    subscriptionId: businessSubscription.id,
    status: 'PENDING',
    cycle: req.body?.cycle ?? 'MONTHLY',
    transactionReference: req.body?.transactionReference ?? 'TXN-00000',
    senderName: req.body?.senderName ?? BUSINESS_OWNER.name,
    amount: req.body?.amount ?? '6000.00',
    method: req.body?.method ?? 'BANK',
    paymentDate: req.body?.paymentDate ?? new Date().toISOString(),
    invoiceNumber: null,
    rejectionReason: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
    plan: { name: 'Growth' },
  };
  businessSubscriptionPayments.unshift(payment);
  return created(res, payment);
});

on('GET', '/audit', (_req, res) => ok(res, { items: auditEvents, nextCursor: null }));

/* --- platform --- */

on('GET', '/platform/health', (_req, res) => ok(res, { status: 'healthy', database: 'connected', checkedAt: new Date().toISOString() }));
on('GET', '/platform/businesses', (_req, res) => ok(res, { items: platformBusinesses, nextCursor: null }));
on('POST', '/platform/businesses', (req, res) => {
  const template = templates.find((item) => item.key === req.body?.templateKey) ?? tailorTemplate;
  const business = {
    id: rid(),
    name: req.body?.name ?? 'New business',
    slug: req.body?.slug ?? `business-${platformBusinesses.length + 1}`,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    template: { id: template.id, key: template.key, name: template.name },
    _count: { memberships: 0 },
    owner: null,
    activeMemberships: 0,
  };
  platformBusinesses.unshift(business);
  return created(res, business);
});
on('PATCH', '/platform/businesses/:id/status', (req, res) => {
  const business = platformBusinesses.find((item) => item.id === req.params.id);
  if (!business) return fail(res, 404, 'NOT_FOUND', 'Business not found');
  business.status = req.body?.status ?? business.status;
  return ok(res, business);
});
on('POST', '/platform/businesses/:id/owners', (req, res) => {
  const business = platformBusinesses.find((item) => item.id === req.params.id);
  if (!business) return fail(res, 404, 'NOT_FOUND', 'Business not found');
  business.owner = { id: rid(), name: req.body?.name ?? 'New owner', email: req.body?.email ?? 'owner@example.test' };
  business.activeMemberships = (business.activeMemberships ?? 0) + 1;
  return created(res, { business: { id: business.id, name: business.name }, owner: business.owner, membershipId: rid(), accountCreated: true });
});
on('GET', '/platform/businesses/:id/members', (req, res) => {
  const business = platformBusinesses.find((item) => item.id === req.params.id) ?? platformBusinesses[0];
  const items = businessMembers.slice(0, 3).map((member, index) => ({
    ...member,
    id: uuid(`platform-membership:${business.slug}:${index}`),
    otherActiveBusinesses: index,
  }));
  return ok(res, {
    business: { id: business.id, name: business.name, slug: business.slug, status: business.status },
    items,
    totalCount: items.length,
    activeCount: items.filter((member) => member.active).length,
    activeOwnerCount: 1,
  });
});
on('PATCH', '/platform/businesses/:id/members/:membershipId', (req, res) => {
  const member = businessMembers[0];
  return ok(res, { ...member, id: req.params.membershipId, active: req.body?.active ?? member.active, otherActiveBusinesses: 0 });
});
on('DELETE', '/platform/businesses/:id/members/:membershipId', (req, res) => ok(res, { ...businessMembers[0], id: req.params.membershipId, active: false, otherActiveBusinesses: 0 }));

on('GET', '/platform/templates', (_req, res) => ok(res, { items: templates }));
on('POST', '/platform/templates', (req, res) => {
  const template = {
    id: rid(),
    key: req.body?.key ?? `template-${templates.length + 1}`,
    name: req.body?.name ?? 'Custom template',
    category: req.body?.category ?? 'GENERAL',
    description: req.body?.description ?? null,
    terminology: req.body?.terminology ?? {},
    enabledModules: req.body?.enabledModules ?? [],
    itemTypes: req.body?.itemTypes ?? [{ key: 'item', label: 'Item' }],
    paymentMethods: PAYMENT_METHODS,
    dashboardWidgets: WIDGETS,
    isSystem: false,
    active: true,
    fields: [],
    workflowStages: buildStages(req.body?.key ?? 'custom', [['NEW', 'New', 0], ['IN_PROGRESS', 'In progress', 1], ['COMPLETED', 'Completed', 2]]),
    workflowTransitions: buildTransitions(req.body?.key ?? 'custom', [['NEW', 'New', 0], ['IN_PROGRESS', 'In progress', 1], ['COMPLETED', 'Completed', 2]]),
  };
  templates.push(template);
  return created(res, template);
});
on('PUT', '/platform/templates/:id', (req, res) => {
  const template = templates.find((item) => item.id === req.params.id);
  if (!template) return fail(res, 404, 'NOT_FOUND', 'Template not found');
  Object.assign(template, req.body ?? {});
  return ok(res, template);
});
on('GET', '/platform/templates/:id/revisions', (req, res) => ok(res, {
  items: Array.from({ length: 4 }, (_, index) => ({
    id: uuid(`template-revision:${req.params.id}:${index}`),
    templateId: req.params.id,
    version: 4 - index,
    snapshot: { name: templates[0].name },
    actorId: SUPER_ADMIN.id,
    requestId: rid(),
    createdAt: ago(index * 5 + 2),
    actor: index % 3 === 0 ? null : { id: SUPER_ADMIN.id, name: SUPER_ADMIN.name, email: SUPER_ADMIN.email },
  })),
}));

on('GET', '/platform/staff', (_req, res) => ok(res, { items: platformStaff }));
on('POST', '/platform/staff', (req, res) => {
  const staff = { id: rid(), name: req.body?.name ?? 'New staff', email: req.body?.email ?? 'staff@vela.test', active: true, permissions: req.body?.permissions ?? [] };
  platformStaff.push(staff);
  return created(res, staff);
});
on('PATCH', '/platform/staff/:id/permissions', (req, res) => {
  const staff = platformStaff.find((item) => item.id === req.params.id);
  if (!staff) return fail(res, 404, 'NOT_FOUND', 'Platform staff account not found');
  if (Array.isArray(req.body?.permissions)) staff.permissions = req.body.permissions;
  if (typeof req.body?.active === 'boolean') staff.active = req.body.active;
  return ok(res, staff);
});
on('GET', '/platform/permissions', (_req, res) => ok(res, { items: platformPermissions.map(([key, description]) => ({ key, description })) }));

on('GET', '/platform/billing/dashboard', (_req, res) => ok(res, billingDashboard));
on('GET', '/platform/billing/plans', (_req, res) => ok(res, { items: subscriptionPlans }));
on('POST', '/platform/billing/plans', (req, res) => {
  const plan = {
    id: rid(),
    name: req.body?.name ?? 'New plan',
    description: req.body?.description ?? null,
    monthlyPrice: req.body?.monthlyPrice ?? '0.00',
    yearlyPrice: req.body?.yearlyPrice ?? '0.00',
    currency: 'PKR',
    trialDays: Number(req.body?.trialDays ?? 14),
    features: req.body?.features ?? {},
    limits: req.body?.limits ?? {},
    active: true,
    isDefault: false,
    _count: { subscriptions: 0, payments: 0 },
  };
  subscriptionPlans.push(plan);
  return created(res, plan);
});
on('PATCH', '/platform/billing/plans/:id', (req, res) => {
  const plan = subscriptionPlans.find((item) => item.id === req.params.id);
  if (!plan) return fail(res, 404, 'NOT_FOUND', 'Plan not found');
  Object.assign(plan, req.body ?? {});
  return ok(res, plan);
});

on('GET', '/platform/billing/payments', (req, res) => {
  const status = req.query.get('status') ?? 'REVIEW';
  const items = status === 'REVIEW'
    ? platformSubscriptionPayments.filter((payment) => ['PENDING', 'UNDER_REVIEW'].includes(payment.status))
    : platformSubscriptionPayments;
  return ok(res, { items, nextCursor: null });
});
on('POST', '/platform/billing/payments/:id/review', (req, res) => {
  const payment = platformSubscriptionPayments.find((item) => item.id === req.params.id);
  if (!payment) return fail(res, 404, 'NOT_FOUND', 'Payment not found');
  payment.status = req.body?.status ?? payment.status;
  return ok(res, { id: payment.id, status: payment.status });
});
on('POST', '/platform/billing/payments/:id/adjustments', (req, res) => ok(res, {
  id: rid(),
  action: req.body?.kind === 'REFUND_RECORDED' ? 'payment.refund_recorded' : 'payment.adjustment_recorded',
  metadata: { amount: req.body?.amount, reason: req.body?.reason },
  createdAt: new Date().toISOString(),
}));

on('GET', '/platform/billing/settings', (_req, res) => ok(res, billingSettings));
on('PUT', '/platform/billing/settings', (req, res) => {
  Object.assign(billingSettings, req.body ?? {});
  return ok(res, billingSettings);
});

on('GET', '/platform/billing/businesses', (_req, res) => ok(res, { items: platformBusinesses, nextCursor: null }));
on('GET', '/platform/billing/businesses/:id', (req, res) => {
  const business = platformBusinesses.find((item) => item.id === req.params.id) ?? platformBusinesses[0];
  return ok(res, {
    business: { id: business.id, name: business.name, slug: business.slug },
    subscriptions: [{
      id: uuid(`platform-subscription:${business.slug}`),
      businessId: business.id,
      planId: subscriptionPlans[1].id,
      status: business.status === 'SUSPENDED' ? 'EXPIRED' : 'ACTIVE',
      cycle: 'MONTHLY',
      startsAt: ago(40),
      endsAt: ahead(20),
      graceUntil: ahead(27),
      customPrice: null,
      discountAmount: '0.00',
      complimentary: false,
      grandfathered: false,
      createdAt: ago(40),
    }],
    payments: platformSubscriptionPayments.filter((payment) => payment.businessId === business.id),
    events: auditEvents.slice(0, 5),
  });
});
on('POST', '/platform/billing/businesses/:id/subscriptions', (req, res) => {
  const business = platformBusinesses.find((item) => item.id === req.params.id) ?? platformBusinesses[0];
  return created(res, {
    id: rid(),
    businessId: business.id,
    planId: req.body?.planId ?? subscriptionPlans[0].id,
    status: req.body?.status ?? 'ACTIVE',
    cycle: req.body?.cycle ?? 'MONTHLY',
    startsAt: req.body?.startsAt ?? new Date().toISOString(),
    endsAt: req.body?.endsAt ?? ahead(30),
    graceUntil: req.body?.endsAt ?? ahead(30),
    customPrice: req.body?.customPrice ?? null,
    discountAmount: req.body?.discountAmount ?? '0.00',
    complimentary: Boolean(req.body?.complimentary),
    grandfathered: false,
    createdAt: new Date().toISOString(),
  });
});
on('PATCH', '/platform/billing/subscriptions/:id/status', (req, res) => ok(res, {
  id: req.params.id,
  businessId: BUSINESS_ID,
  planId: subscriptionPlans[0].id,
  status: req.body?.status ?? 'ACTIVE',
  cycle: 'MONTHLY',
  startsAt: ago(10),
  endsAt: ahead(20),
  graceUntil: ahead(27),
  customPrice: null,
  discountAmount: '0.00',
  complimentary: false,
  grandfathered: false,
  createdAt: ago(10),
}));

on('GET', '/platform/billing/report.csv', (_req, res) => {
  const rows = [['Invoice', 'Business', 'Plan', 'Amount', 'Method', 'Status', 'Payment date']]
    .concat(platformSubscriptionPayments.map((payment) => [
      payment.invoiceNumber, payment.business?.name, payment.plan.name, payment.amount,
      payment.method, payment.status, payment.paymentDate.slice(0, 10),
    ]));
  send(res, 200, undefined, { 'content-type': 'text/csv' });
  res.end(rows.map((row) => row.join(',')).join('\n'));
});

const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
on('GET', '/subscriptions/payments/:id/receipt.pdf', (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': minimalPdf.length });
  res.end(minimalPdf);
});
on('GET', '/platform/billing/payments/:id/receipt.pdf', (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': minimalPdf.length });
  res.end(minimalPdf);
});

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, undefined);
  if (!url.pathname.startsWith('/api/v1')) return fail(res, 404, 'NOT_FOUND', 'Unknown route');
  const parts = url.pathname.slice('/api/v1'.length).split('/').filter(Boolean);

  let chunks = '';
  req.on('data', (chunk) => { chunks += chunk; });
  req.on('end', () => {
    let body;
    try {
      body = chunks ? JSON.parse(chunks) : undefined;
    } catch {
      return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    }
    const request = {
      method: req.method,
      query: url.searchParams,
      params: {},
      token: (req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''),
      body,
    };
    for (const route of routes) {
      if (route.method !== req.method || route.pattern.length !== parts.length) continue;
      let matched = true;
      const params = {};
      for (let index = 0; index < route.pattern.length; index += 1) {
        const expected = route.pattern[index];
        if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(parts[index]);
        else if (expected !== parts[index]) { matched = false; break; }
      }
      if (!matched) continue;
      request.params = params;
      const result = route.handler(request, res);
      if (result && typeof result.then === 'function') result.catch((error) => fail(res, 500, 'DEMO_API_ERROR', String(error)));
      return;
    }
    return fail(res, 404, 'NOT_FOUND', `No demo route for ${req.method} ${url.pathname}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`demo api listening on http://127.0.0.1:${PORT}/api/v1\n`);
});
