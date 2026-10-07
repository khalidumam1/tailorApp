/**
 * Preview API — UI review fixture, NOT the product API.
 * ---------------------------------------------------------------------------
 * The real API lives in `backend/` and talks to Postgres through Prisma. This
 * sandbox cannot download Prisma's engine binaries (binaries.prisma.sh is not
 * reachable), so this standalone stub serves the same routes and response
 * shapes with in-memory demo data, purely so the redesigned web UI can be
 * clicked through end to end.
 *
 * It mirrors the real app in two ways that matter for this review:
 *   - identical envelopes: { data: ... } on success, { error: { code, message } } on failure
 *   - CORS set to `*` (any origin), matching CORS_ORIGINS=* in the real API
 *
 * Run: node tools/preview-api/server.mjs   (PORT defaults to 5000)
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 5000);
const CURRENCY = 'PKR';
const TZ = 'Asia/Karachi';

/* ------------------------------------------------------------------ helpers */
const iso = (d) => new Date(d).toISOString();
const daysFromNow = (n) => iso(Date.now() + n * 86_400_000);
const money = (n) => n.toFixed(2);

const BUSINESS = { id: randomUUID(), name: 'Rizwan Tailors', slug: 'rizwan-tailors' };
const OWNER = {
  id: randomUUID(),
  name: 'Ahmed Khan',
  email: 'owner@rizwantailors.pk',
  password: 'WorkroomOwner2026!',
};
const PLAN_ID = randomUUID();

const STAGES = [
  { key: 'NEW', label: 'New', isInitial: true, isTerminal: false },
  { key: 'CUTTING', label: 'Cutting', isInitial: false, isTerminal: false },
  { key: 'STITCHING', label: 'Stitching', isInitial: false, isTerminal: false },
  { key: 'FINISHING', label: 'Finishing', isInitial: false, isTerminal: false },
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup', isInitial: false, isTerminal: false },
  { key: 'COLLECTED', label: 'Collected', isInitial: false, isTerminal: true },
  { key: 'CANCELLED', label: 'Cancelled', isInitial: false, isTerminal: true },
].map((stage, index) => ({
  ...stage,
  id: randomUUID(),
  templateId: null,
  businessId: BUSINESS.id,
  sortOrder: index,
  actions: [],
}));
const stageByKey = (key) => STAGES.find((stage) => stage.key === key) ?? STAGES[0];

const TRANSITIONS = [
  ['NEW', 'CUTTING'], ['CUTTING', 'STITCHING'], ['STITCHING', 'FINISHING'],
  ['FINISHING', 'READY_FOR_PICKUP'], ['READY_FOR_PICKUP', 'COLLECTED'],
  ['NEW', 'CANCELLED'], ['CUTTING', 'CANCELLED'],
].map(([from, to]) => ({
  id: randomUUID(),
  templateId: null,
  businessId: BUSINESS.id,
  fromStageId: stageByKey(from).id,
  toStageId: stageByKey(to).id,
  allowedRoleKeys: ['owner', 'manager'],
  actions: [],
}));

/* --------------------------------------------------------------- demo data */
const customer = (name, phone, consent) => ({
  id: randomUUID(),
  name,
  phone,
  whatsappConsent: consent,
  whatsappConsentAt: consent ? daysFromNow(-40) : null,
  whatsappOptedOutAt: null,
  notes: null,
  customFields: {},
  version: 1,
  createdAt: daysFromNow(-60 + Math.floor(Math.random() * 40)),
});

const db = {
  customers: [
    customer('Imran Sheikh', '+923001234567', true),
    customer('Sana Malik', '+923008765432', true),
    customer('Bilal Ahmed', '+923331112233', false),
    customer('Hira Qureshi', '+923214445566', true),
    customer('Usman Raza', '+923457778899', false),
  ],
  orders: [],
  payments: [],
  notifications: [],
  measurements: new Map(),
  sessions: new Map(),
  orderSeq: 1040,
  receiptSeq: 500,
};

const CATALOG = [
  ['shalwar_kameez', 'Shalwar Kameez (stitch)', 'SK-01', '2200.00'],
  ['waistcoat', 'Waistcoat', 'WC-02', '1800.00'],
  ['sherwani', 'Sherwani', 'SH-03', '9500.00'],
  ['kurta', 'Kurta', 'KU-04', '1500.00'],
  ['alteration', 'Alteration / fitting', 'AL-05', '500.00'],
].map(([typeKey, name, sku, unitPrice], index) => ({
  id: randomUUID(),
  businessId: BUSINESS.id,
  typeKey,
  name,
  description: null,
  sku,
  unit: 'piece',
  unitPrice,
  sortOrder: index,
  version: 1,
  active: true,
  createdAt: daysFromNow(-120),
  updatedAt: daysFromNow(-10),
  customFields: {},
}));

const MEASUREMENT_TEMPLATES = [
  {
    id: randomUUID(),
    name: 'Shalwar Kameez',
    fields: [
      { key: 'length', label: 'Kameez length', unit: 'in', required: true },
      { key: 'chest', label: 'Chest', unit: 'in', required: true },
      { key: 'waist', label: 'Waist', unit: 'in', required: true },
      { key: 'shoulder', label: 'Shoulder', unit: 'in', required: true },
      { key: 'sleeve', label: 'Sleeve', unit: 'in', required: true },
      { key: 'shalwar_length', label: 'Shalwar length', unit: 'in', required: true },
    ],
  },
  {
    id: randomUUID(),
    name: 'Waistcoat',
    fields: [
      { key: 'length', label: 'Length', unit: 'in', required: true },
      { key: 'chest', label: 'Chest', unit: 'in', required: true },
      { key: 'waist', label: 'Waist', unit: 'in', required: false },
    ],
  },
];

function seedOrder({ customerIndex, stage, items, promisedInDays, paidAmount }) {
  const cust = db.customers[customerIndex];
  const total = items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
  const order = {
    id: randomUUID(),
    orderNumber: `ORD-${++db.orderSeq}`,
    status: stage,
    workflowStageId: stageByKey(stage).id,
    workflowStageKey: stage,
    currentWorkflowStage: (({ id, key, label, sortOrder, isInitial, isTerminal }) =>
      ({ id, key, label, sortOrder, isInitial, isTerminal }))(stageByKey(stage)),
    version: 1,
    total: money(total),
    paid: money(paidAmount),
    outstanding: money(total - paidAmount),
    promisedAt: daysFromNow(promisedInDays),
    createdAt: daysFromNow(promisedInDays - 9),
    customer: { id: cust.id, name: cust.name, phone: cust.phone },
    customFields: {},
    items: items.map((item) => ({
      id: randomUUID(),
      garmentName: item.name,
      itemName: item.name,
      itemTypeKey: item.typeKey,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      measurementSnapshot: {},
      customFields: {},
    })),
  };
  db.orders.push(order);
  if (paidAmount > 0) {
    db.payments.push({
      id: randomUUID(),
      receiptNumber: `RCPT-${++db.receiptSeq}`,
      amount: money(paidAmount),
      method: 'CASH',
      kind: 'PAYMENT',
      createdAt: order.createdAt,
      order: { id: order.id, orderNumber: order.orderNumber, customer: order.customer },
    });
  }
  return order;
}

seedOrder({ customerIndex: 0, stage: 'STITCHING', promisedInDays: 3, paidAmount: 2000,
  items: [{ name: 'Shalwar Kameez (stitch)', typeKey: 'shalwar_kameez', quantity: 2, unitPrice: '2200.00' }] });
seedOrder({ customerIndex: 1, stage: 'READY_FOR_PICKUP', promisedInDays: 0, paidAmount: 22000,
  items: [{ name: 'Sherwani', typeKey: 'sherwani', quantity: 1, unitPrice: '9500.00' },
          { name: 'Waistcoat', typeKey: 'waistcoat', quantity: 1, unitPrice: '1800.00' }] });
seedOrder({ customerIndex: 2, stage: 'NEW', promisedInDays: 7, paidAmount: 0,
  items: [{ name: 'Kurta', typeKey: 'kurta', quantity: 2, unitPrice: '1500.00' }] });
seedOrder({ customerIndex: 3, stage: 'CUTTING', promisedInDays: -2, paidAmount: 1000,
  items: [{ name: 'Shalwar Kameez (stitch)', typeKey: 'shalwar_kameez', quantity: 1, unitPrice: '2200.00' }] });
seedOrder({ customerIndex: 4, stage: 'COLLECTED', promisedInDays: -6, paidAmount: 1800,
  items: [{ name: 'Waistcoat', typeKey: 'waistcoat', quantity: 1, unitPrice: '1800.00' }] });

db.measurements.set(db.customers[0].id, [{
  id: randomUUID(),
  garmentTemplate: MEASUREMENT_TEMPLATES[0],
  revisions: [{
    id: randomUUID(),
    version: 2,
    values: { length: 42, chest: 40, waist: 36, shoulder: 18, sleeve: 24, shalwar_length: 40 },
    notes: 'Loose cuffs, same as last order.',
    measuredAt: daysFromNow(-12),
  }, {
    id: randomUUID(),
    version: 1,
    values: { length: 41.5, chest: 39, waist: 35, shoulder: 18, sleeve: 23.5, shalwar_length: 40 },
    notes: null,
    measuredAt: daysFromNow(-180),
  }],
}]);

const NOTIFICATION_STATUSES = ['DELIVERED', 'READ', 'SENT', 'QUEUED', 'FAILED', 'NOT_SENT'];
db.notifications = db.orders.slice(0, 5).map((order, index) => ({
  id: randomUUID(),
  customerId: order.customer.id,
  orderId: order.id,
  paymentId: null,
  recipientName: order.customer.name,
  kind: index % 2 === 0 ? 'ORDER_CREATED' : 'ORDER_READY',
  status: NOTIFICATION_STATUSES[index % NOTIFICATION_STATUSES.length],
  recipientPhone: order.customer.phone,
  templateName: index % 2 === 0 ? 'tailor_order_created' : 'tailor_order_ready',
  attemptCount: 1,
  lastError: index === 4 ? 'Recipient has not opted in' : null,
  renderedMessage: `Assalam o Alaikum ${order.customer.name}, your order ${order.orderNumber} is being prepared.`,
  sentAt: daysFromNow(-index - 1),
  deliveredAt: index < 2 ? daysFromNow(-index - 1) : null,
  readAt: index === 1 ? daysFromNow(-1) : null,
  failedAt: index === 4 ? daysFromNow(-2) : null,
  createdAt: daysFromNow(-index - 1),
  updatedAt: daysFromNow(-index - 1),
}));

const PLAN = {
  id: PLAN_ID,
  name: 'Workroom Pro',
  description: 'Unlimited orders, WhatsApp notifications and daily backups.',
  monthlyPrice: '2500.00',
  yearlyPrice: '25000.00',
  currency: CURRENCY,
  trialDays: 14,
  features: { whatsapp: true, reports: true, multiStaff: true },
  limits: { staff: 10, ordersPerMonth: 2000 },
  active: true,
  isDefault: true,
};

const SUBSCRIPTION = {
  id: randomUUID(),
  businessId: BUSINESS.id,
  planId: PLAN.id,
  status: 'ACTIVE',
  cycle: 'MONTHLY',
  startsAt: daysFromNow(-12),
  endsAt: daysFromNow(18),
  graceUntil: daysFromNow(25),
  customPrice: null,
  discountAmount: '0.00',
  complimentary: false,
  grandfathered: false,
  createdAt: daysFromNow(-12),
  plan: PLAN,
};

const CONFIGURATION = {
  business: {
    id: BUSINESS.id,
    name: BUSINESS.name,
    logoUrl: null,
    type: 'TAILOR',
    currency: CURRENCY,
    timezone: TZ,
  },
  template: { id: randomUUID(), key: 'tailor', name: 'Tailor shop', category: 'SERVICES' },
  itemTypes: CATALOG.map((item) => ({ key: item.typeKey, label: item.name })),
  availableModules: ['orders', 'catalog', 'customers', 'measurements', 'payments', 'notifications'],
  availablePaymentMethods: ['CASH', 'BANK', 'DIGITAL'],
  availableDashboardWidgets: ['newOrders', 'dueToday', 'overdue', 'inProgress', 'outstanding', 'collectedToday'],
  terminology: { order: 'Order', customer: 'Customer', item: 'Garment' },
  enabledModules: ['orders', 'catalog', 'customers', 'measurements', 'payments', 'notifications'],
  paymentMethods: ['CASH', 'BANK', 'DIGITAL'],
  contactPhone: '+92 21 3456 7890',
  dashboardWidgets: ['newOrders', 'dueToday', 'overdue', 'inProgress', 'outstanding', 'collectedToday'],
  notificationTemplates: {
    ORDER_CREATED: { enabled: true, body: 'Your order {{orderNumber}} has been received.' },
    ORDER_READY: { enabled: true, body: 'Your order {{orderNumber}} is ready for pickup.' },
    PAYMENT_RECEIVED: { enabled: true, body: 'We received {{amount}} for order {{orderNumber}}.' },
  },
  fields: [],
  tenantFields: [],
  workflow: { stages: STAGES, transitions: TRANSITIONS },
  workflowIsTenantScoped: true,
  version: 4,
  configurationVersion: 4,
  templateVersion: 2,
  cacheVersion: 4,
  publishedAt: daysFromNow(-5),
};

const PERMISSIONS = [
  'orders:read', 'orders:write',
  'customers:read', 'customers:write',
  'measurements:read', 'measurements:write',
  'payments:read', 'payments:write',
  'notifications:read',
  'subscriptions:read',
];

/* ------------------------------------------------------------------ routing */
function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}
const ok = (res, data) => send(res, 200, { data });
const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

function authenticate(req, res) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!db.sessions.has(token)) {
    fail(res, 401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    return null;
  }
  return db.sessions.get(token);
}

function issueSession() {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  db.sessions.set(accessToken, { userId: OWNER.id, refreshToken });
  return { accessToken, refreshToken };
}

function dashboard() {
  const today = new Date().toDateString();
  const outstanding = db.orders.reduce((sum, order) => sum + Number(order.outstanding), 0);
  const collectedToday = db.payments
    .filter((payment) => new Date(payment.createdAt).toDateString() === today)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  return {
    newOrders: db.orders.filter((order) => order.status === 'NEW').length,
    dueToday: db.orders.filter((order) =>
      new Date(order.promisedAt).toDateString() === today && order.status !== 'COLLECTED').length,
    overdue: db.orders.filter((order) =>
      new Date(order.promisedAt) < new Date() && !['COLLECTED', 'CANCELLED'].includes(order.status)).length,
    inProgress: db.orders.filter((order) =>
      ['CUTTING', 'STITCHING', 'FINISHING'].includes(order.status)).length,
    alterations: db.orders.filter((order) =>
      order.items.some((item) => item.itemTypeKey === 'alteration')).length,
    outstanding: money(outstanding),
    collectedToday: money(collectedToday),
    asOf: iso(Date.now()),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

const server = createServer(async (req, res) => {
  // CORS: wildcard, exactly as CORS_ORIGINS=* configures the real API.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, Idempotency-Key, X-Request-Id, Accept');
  res.setHeader('access-control-expose-headers', 'x-request-id');
  res.setHeader('access-control-max-age', '600');
  res.setHeader('x-request-id', randomUUID());
  res.setHeader('x-preview-api', 'demo-data');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const method = req.method ?? 'GET';
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(req) : {};

  if (path === '/health' || path === '/healthz') return ok(res, { status: 'ok', mode: 'preview-fixture' });

  /* ---- auth ---- */
  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email !== OWNER.email || body.password !== OWNER.password) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const session = issueSession();
    return ok(res, {
      user: { id: OWNER.id, name: OWNER.name, email: OWNER.email, platformRole: null },
      business: { id: BUSINESS.id, name: BUSINESS.name },
      ...session,
    });
  }
  if (path === '/auth/refresh' && method === 'POST') return ok(res, issueSession());
  if (path === '/auth/logout' && method === 'POST') {
    const header = req.headers.authorization ?? '';
    db.sessions.delete(header.replace('Bearer ', ''));
    return ok(res, { revoked: true });
  }

  const session = authenticate(req, res);
  if (!session) return;

  if (path === '/auth/me') {
    return ok(res, {
      user: { id: OWNER.id, name: OWNER.name, email: OWNER.email, platformRole: null },
      context: {
        scope: 'business',
        business: { id: BUSINESS.id, name: BUSINESS.name, slug: BUSINESS.slug, timezone: TZ },
        permissions: PERMISSIONS,
        platformPermissions: [],
      },
    });
  }

  /* ---- reads ---- */
  if (path === '/reports/dashboard') return ok(res, dashboard());
  if (path === '/business/configuration') return ok(res, CONFIGURATION);
  if (path === '/measurements/templates') return ok(res, { items: MEASUREMENT_TEMPLATES });
  if (path === '/notifications') return ok(res, { items: db.notifications, nextCursor: null });
  if (path === '/payments') return ok(res, { items: db.payments, nextCursor: null });
  if (path === '/catalog') {
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = CATALOG.filter((item) => !query || item.name.toLowerCase().includes(query));
    return ok(res, { items, nextCursor: null });
  }
  if (path === '/customers' && method === 'GET') {
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = db.customers.filter((item) =>
      !query || item.name.toLowerCase().includes(query) || item.phone.includes(query));
    return ok(res, { items, nextCursor: null });
  }
  if (path === '/orders' && method === 'GET') {
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = [...db.orders].reverse().filter((order) =>
      !query
      || order.customer.name.toLowerCase().includes(query)
      || order.orderNumber.toLowerCase().includes(query));
    return ok(res, { items, nextCursor: null });
  }
  if (path === '/subscriptions' && method === 'GET') {
    return ok(res, {
      subscription: SUBSCRIPTION,
      plans: [PLAN],
      payments: [],
      events: [],
      paymentInstructions:
        'Transfer the plan amount to Meezan Bank account 0123-4567-8910 (TailorApp Pvt Ltd), '
        + 'then submit the transaction reference below. Approval usually takes one working day.',
      paymentMethods: ['BANK', 'DIGITAL'],
      supportContact: '+92 21 3456 7890',
    });
  }

  let match = path.match(/^\/measurements\/customers\/([\w-]+)$/);
  if (match && method === 'GET') return ok(res, { items: db.measurements.get(match[1]) ?? [] });

  match = path.match(/^\/payments\/([\w-]+)\/receipt$/);
  if (match) {
    const payment = db.payments.find((item) => item.id === match[1]);
    if (!payment) return fail(res, 404, 'NOT_FOUND', 'Receipt not found.');
    return ok(res, {
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      method: payment.method,
      kind: payment.kind,
      createdAt: payment.createdAt,
      business: { name: BUSINESS.name, timezone: TZ, currency: CURRENCY },
      order: {
        orderNumber: payment.order.orderNumber,
        customer: { name: payment.order.customer.name, phone: payment.order.customer.phone },
      },
      correctionOf: null,
    });
  }

  /* ---- writes ---- */
  if (path === '/customers' && method === 'POST') {
    const created = customer(String(body.name ?? 'New customer'), String(body.phone ?? '+92'), Boolean(body.whatsappConsent));
    created.createdAt = iso(Date.now());
    db.customers.unshift(created);
    return ok(res, created);
  }

  match = path.match(/^\/customers\/([\w-]+)\/whatsapp-consent$/);
  if (match && method === 'POST') {
    const found = db.customers.find((item) => item.id === match[1]);
    if (!found) return fail(res, 404, 'NOT_FOUND', 'Customer not found.');
    found.whatsappConsent = Boolean(body.consented);
    found.whatsappConsentAt = found.whatsappConsent ? iso(Date.now()) : found.whatsappConsentAt;
    found.whatsappOptedOutAt = found.whatsappConsent ? null : iso(Date.now());
    found.version += 1;
    return ok(res, found);
  }

  if (path === '/orders' && method === 'POST') {
    const cust = db.customers.find((item) => item.id === body.customerId) ?? db.customers[0];
    const items = Array.isArray(body.items) && body.items.length ? body.items : [];
    const total = items.reduce((sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0), 0);
    const order = {
      id: randomUUID(),
      orderNumber: `ORD-${++db.orderSeq}`,
      status: 'NEW',
      workflowStageId: stageByKey('NEW').id,
      workflowStageKey: 'NEW',
      currentWorkflowStage: (({ id, key, label, sortOrder, isInitial, isTerminal }) =>
        ({ id, key, label, sortOrder, isInitial, isTerminal }))(stageByKey('NEW')),
      version: 1,
      total: money(total),
      paid: '0.00',
      outstanding: money(total),
      promisedAt: body.promisedAt ?? daysFromNow(7),
      createdAt: iso(Date.now()),
      customer: { id: cust.id, name: cust.name, phone: cust.phone },
      customFields: body.customFields ?? {},
      items: items.map((item) => ({
        id: randomUUID(),
        garmentName: item.garmentName ?? item.itemName ?? 'Item',
        itemName: item.itemName ?? item.garmentName ?? 'Item',
        itemTypeKey: item.itemTypeKey ?? 'shalwar_kameez',
        quantity: Number(item.quantity ?? 1),
        unitPrice: String(item.unitPrice ?? '0.00'),
        measurementSnapshot: item.measurementSnapshot ?? {},
        customFields: item.customFields ?? {},
      })),
    };
    db.orders.push(order);
    return ok(res, order);
  }

  match = path.match(/^\/orders\/([\w-]+)\/(status|workflow)$/);
  if (match && method === 'POST') {
    const order = db.orders.find((item) => item.id === match[1]);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'Order not found.');
    const nextKey = String(body.status ?? body.toStageKey ?? body.stageKey ?? '').toUpperCase();
    const stage = STAGES.find((item) => item.key === nextKey);
    if (!stage) return fail(res, 422, 'INVALID_TRANSITION', 'That stage is not part of this workflow.');
    order.status = stage.key;
    order.workflowStageId = stage.id;
    order.workflowStageKey = stage.key;
    order.currentWorkflowStage = (({ id, key, label, sortOrder, isInitial, isTerminal }) =>
      ({ id, key, label, sortOrder, isInitial, isTerminal }))(stage);
    order.version += 1;
    return ok(res, order);
  }

  match = path.match(/^\/payments\/orders\/([\w-]+)$/);
  if (match && method === 'POST') {
    const order = db.orders.find((item) => item.id === match[1]);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'Order not found.');
    const amount = Number(body.amount ?? 0);
    if (!(amount > 0)) return fail(res, 422, 'INVALID_AMOUNT', 'Enter an amount greater than zero.');
    if (amount > Number(order.outstanding)) {
      return fail(res, 422, 'AMOUNT_EXCEEDS_BALANCE', 'Amount is higher than the balance due on this order.');
    }
    const payment = {
      id: randomUUID(),
      receiptNumber: `RCPT-${++db.receiptSeq}`,
      amount: money(amount),
      method: body.method ?? 'CASH',
      kind: 'PAYMENT',
      createdAt: iso(Date.now()),
      order: { id: order.id, orderNumber: order.orderNumber, customer: order.customer },
    };
    db.payments.unshift(payment);
    order.paid = money(Number(order.paid) + amount);
    order.outstanding = money(Number(order.total) - Number(order.paid));
    order.version += 1;
    const { order: _omitted, ...withoutOrder } = payment;
    return ok(res, withoutOrder);
  }

  match = path.match(/^\/measurements\/customers\/([\w-]+)\/revisions$/);
  if (match && method === 'POST') {
    const template = MEASUREMENT_TEMPLATES.find((item) => item.id === body.garmentTemplateId)
      ?? MEASUREMENT_TEMPLATES[0];
    const profiles = db.measurements.get(match[1]) ?? [];
    let profile = profiles.find((item) => item.garmentTemplate.id === template.id);
    if (!profile) {
      profile = { id: randomUUID(), garmentTemplate: template, revisions: [] };
      profiles.push(profile);
      db.measurements.set(match[1], profiles);
    }
    const revision = {
      id: randomUUID(),
      version: profile.revisions.length + 1,
      values: body.values ?? {},
      notes: body.notes ?? null,
      measuredAt: iso(Date.now()),
    };
    profile.revisions.unshift(revision);
    return ok(res, { profile, revision });
  }

  return fail(res, 404, 'NOT_FOUND', `No preview route for ${method} ${path}`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview-api] demo fixture listening on http://0.0.0.0:${PORT}`);
  console.log('[preview-api] CORS: Access-Control-Allow-Origin: *');
  console.log(`[preview-api] sign in with ${OWNER.email} / ${OWNER.password}`);
});
