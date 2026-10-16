/**
 * Contract tests for the mobile <-> API mapping.
 *
 * The request builders are validated against the same zod schemas the backend
 * uses (@tailor/shared), so a body that the server would reject fails here first.
 * Run with `npm test --workspace @tailor/mobile`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptFor,
  buildCatalogRequest,
  buildOrderRequest,
  dueDateToPromisedAt,
  fetchAllPages,
  mapRemoteCustomer,
  mapRemoteOrder,
  orderPaymentMethodOptions,
  safeParseCache,
  subscriptionAmountFor,
  type RemoteOrder,
} from '../erp-mapping';

// What goes over the wire: undefined fields are dropped by JSON.stringify.
const wire = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

// @tailor/shared exposes only the ESM "import" condition, so load it dynamically.
const loadShared = () => import('@tailor/shared');

const CUSTOMER_ID = '6f1f3c2a-1b2c-4d5e-8f90-123456789abc';
const TEMPLATE_ID = '7a2e4d3b-2c3d-4e5f-9a01-23456789abcd';
const ORDER_ID = '8b3f5e4c-3d4e-4f60-8b12-3456789abcde';

const baseOrderForm = {
  customerId: CUSTOMER_ID,
  itemTypeKey: 'garment',
  itemName: '  Kurta  ',
  quantity: '2',
  unitPrice: '1500.50',
  dueDate: '2026-10-20',
  notes: '   ',
  orderCustomFields: {},
  itemCustomFields: { fabric: 'Lawn' },
};

test('buildOrderRequest produces a body the server schema accepts', async () => {
  const { createOrderSchema } = await loadShared();
  const body = buildOrderRequest(baseOrderForm);
  const parsed = createOrderSchema.safeParse(wire(body));
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
  assert.deepEqual(Object.keys(wire(body)).sort(), ['customFields', 'customerId', 'items', 'promisedAt']);
  assert.deepEqual(body.items, [{
    itemTypeKey: 'garment',
    itemName: 'Kurta',
    quantity: 2,
    unitPrice: '1500.50',
    customFields: { fabric: 'Lawn' },
  }]);
});

test('buildOrderRequest sends the due date as an end-of-day Karachi timestamp', () => {
  const body = buildOrderRequest(baseOrderForm);
  assert.equal(body.promisedAt, '2026-10-20T18:59:00.000Z');
});

test('buildOrderRequest omits blank notes and rejects invalid input', () => {
  assert.equal(wire(buildOrderRequest(baseOrderForm)).notes, undefined);
  assert.throws(() => buildOrderRequest({ ...baseOrderForm, quantity: '0' }), /whole number/);
  assert.throws(() => buildOrderRequest({ ...baseOrderForm, quantity: '1.5' }), /whole number/);
  assert.throws(() => buildOrderRequest({ ...baseOrderForm, itemName: '   ' }), /item name/);
  assert.throws(() => buildOrderRequest({ ...baseOrderForm, dueDate: '20/10/2026' }), /due date/);
});

test('dueDateToPromisedAt rejects impossible dates', () => {
  assert.throws(() => dueDateToPromisedAt('2026-02-30T00:00'), /due date/);
  assert.equal(dueDateToPromisedAt('2026-12-31'), '2026-12-31T18:59:00.000Z');
});

test('mapRemoteOrder converts the API order into the local field names the screens read', () => {
  const remote: RemoteOrder = {
    id: ORDER_ID,
    orderNumber: 'ORD-0007',
    customerId: CUSTOMER_ID,
    customer: { id: CUSTOMER_ID, name: 'Ali Khan', phone: '+923001234567' },
    status: 'CUTTING',
    workflowStageKey: 'cutting',
    promisedAt: '2026-10-20T18:59:00.000Z',
    total: '3001.00',
    version: 4,
    createdAt: '2026-10-16T08:00:00.000Z',
    customFields: { rush: true },
    items: [
      { itemTypeKey: 'garment', itemName: 'Kurta', garmentName: 'Kurta', quantity: 2, unitPrice: '1500.50', customFields: { fabric: 'Lawn' } },
      { itemTypeKey: 'garment', itemName: 'Shalwar', garmentName: 'Shalwar', quantity: 1, unitPrice: '0.00' },
    ],
  };
  const local = mapRemoteOrder(remote);
  assert.equal(local.id, ORDER_ID);
  assert.equal(local.customer_id, CUSTOMER_ID);
  assert.equal(local.customer_name, 'Ali Khan');
  assert.equal(local.promised_at, '2026-10-20T18:59:00.000Z');
  assert.equal(local.garment_name, 'Kurta');
  assert.equal(local.item_name, 'Kurta');
  assert.equal(local.quantity, 3);
  assert.equal(local.unit_price, '1500.50');
  assert.equal(local.workflow_stage_key, 'cutting');
  assert.equal(local.status, 'CUTTING');
  assert.equal(local.total, '3001.00');
  assert.equal(local.version, 4);
  assert.equal(local.order_number, 'ORD-0007');
  assert.equal(local.createdAt, '2026-10-16T08:00:00.000Z');
  assert.deepEqual(JSON.parse(local.order_custom_fields_json ?? '{}'), { rush: true });
  assert.deepEqual(JSON.parse(local.item_custom_fields_json ?? '{}'), { fabric: 'Lawn' });
  // The string fields the screens call .slice() on must always be present.
  assert.equal(typeof local.promised_at, 'string');
});

test('mapRemoteOrder tolerates an order without items or customer', () => {
  const local = mapRemoteOrder({
    id: ORDER_ID,
    customerId: CUSTOMER_ID,
    customer: null,
    status: 'NEW',
    workflowStageKey: null,
    promisedAt: '2026-10-20T18:59:00.000Z',
    total: '0.00',
    version: 1,
    items: [],
  });
  assert.equal(local.customer_name, '');
  assert.equal(local.garment_name, '');
  assert.equal(local.quantity, 1);
  assert.equal(local.workflow_stage_key, null);
});

test('mapRemoteCustomer keeps custom field values the customer screen can read', () => {
  const local = mapRemoteCustomer({
    id: CUSTOMER_ID,
    name: 'Sara',
    phone: '+923009876543',
    notes: null,
    version: 2,
    customFields: { city: 'Lahore' },
  });
  assert.equal(local.notes, '');
  assert.deepEqual(JSON.parse(local.custom_fields_json ?? '{}'), { city: 'Lahore' });
  assert.equal(local.version, 2);
});

test('the customer body the app sends passes the server schema', async () => {
  const { createCustomerSchema } = await loadShared();
  const body = {
    name: 'Sara',
    phone: '0300-1234567',
    notes: '',
    customFields: {},
  };
  assert.equal(createCustomerSchema.safeParse(body).success, true);
});

test('the measurement revision body passes the server schema', async () => {
  const { createMeasurementRevisionSchema } = await loadShared();
  const body = {
    garmentTemplateId: TEMPLATE_ID,
    values: { chest: '38', length: 42 },
    notes: '',
    measuredAt: new Date('2026-10-16T10:00:00.000Z').toISOString(),
  };
  assert.equal(createMeasurementRevisionSchema.safeParse(body).success, true);
});

test('the payment body and workflow transition body pass the server schemas', async () => {
  const { createPaymentSchema, transitionWorkflowSchema } = await loadShared();
  assert.equal(createPaymentSchema.safeParse({ amount: '1500.00', method: 'CASH' }).success, true);
  assert.equal(createPaymentSchema.safeParse({ amount: '0', method: 'CASH' }).success, false);
  assert.equal(transitionWorkflowSchema.safeParse({ toStageKey: 'stitching', version: 3 }).success, true);
});

test('buildCatalogRequest omits blank optional fields so the server accepts them', () => {
  const body = buildCatalogRequest({
    typeKey: 'garment',
    name: '  Waistcoat ',
    description: '',
    sku: '   ',
    unit: '',
    unitPrice: '',
    sortOrder: 3,
    customFields: {},
  });
  assert.deepEqual(wire(body), {
    typeKey: 'garment',
    name: 'Waistcoat',
    unit: 'unit',
    sortOrder: 3,
    customFields: {},
  });
  assert.throws(() => buildCatalogRequest({
    typeKey: 'garment', name: ' ', description: '', sku: '', unit: 'unit', unitPrice: '', sortOrder: 0, customFields: {},
  }), /item name/);
});

test('buildCatalogRequest keeps a valid price and SKU', () => {
  const body = buildCatalogRequest({
    typeKey: 'fabric', name: 'Lawn', description: 'Summer', sku: 'LWN-01', unit: 'metre', unitPrice: '850', sortOrder: 0, customFields: {},
  });
  assert.equal(body.unitPrice, '850');
  assert.equal(body.sku, 'LWN-01');
  assert.equal(body.description, 'Summer');
});

const plans = [{ id: 'basic', monthlyPrice: '1500.00', yearlyPrice: '15000.00' }];

test('subscriptionAmountFor returns the price for the chosen cycle', () => {
  assert.equal(subscriptionAmountFor(plans, 'basic', 'MONTHLY'), '1500.00');
  assert.equal(subscriptionAmountFor(plans, 'basic', 'YEARLY'), '15000.00');
  assert.equal(subscriptionAmountFor(plans, 'missing', 'MONTHLY'), undefined);
});

test('attemptFor reuses the key for an unchanged retry and issues a new key for a changed request', () => {
  let counter = 0;
  const createKey = () => `key-${++counter}`;
  const first = attemptFor(null, 'pay:100:CASH', createKey);
  const retry = attemptFor(first, 'pay:100:CASH', createKey);
  assert.equal(retry.key, first.key, 'an identical retry must reuse the key');
  const changed = attemptFor(first, 'pay:200:CASH', createKey);
  assert.notEqual(changed.key, first.key, 'a different request must get a new key');
  assert.equal(counter, 2);
});

test('fetchAllPages follows cursors until the last page', async () => {
  const pages: Record<string, { items: number[]; nextCursor: string | null }> = {
    start: { items: [1, 2], nextCursor: 'c1' },
    c1: { items: [3], nextCursor: 'c2' },
    c2: { items: [4], nextCursor: null },
  };
  const requested: Array<string | null> = [];
  const all = await fetchAllPages(async (cursor) => {
    requested.push(cursor);
    return pages[cursor ?? 'start']!;
  });
  assert.deepEqual(all, [1, 2, 3, 4]);
  assert.deepEqual(requested, [null, 'c1', 'c2']);
});

test('fetchAllPages stops at the page cap and on an empty page', async () => {
  let calls = 0;
  const capped = await fetchAllPages(async () => {
    calls += 1;
    return { items: [calls], nextCursor: 'more' };
  }, 3);
  assert.deepEqual(capped, [1, 2, 3]);
  assert.equal(calls, 3);

  const empty = await fetchAllPages(async () => ({ items: [], nextCursor: 'more' }));
  assert.deepEqual(empty, []);
});

test('safeParseCache returns null for missing or corrupt cache entries', () => {
  const parse = (value: unknown) => {
    if (typeof value !== 'object' || value === null) throw new Error('invalid');
    return value as { ok: boolean };
  };
  assert.equal(safeParseCache(null, parse), null);
  assert.equal(safeParseCache('{not json', parse), null);
  assert.equal(safeParseCache('"text"', parse), null);
  assert.deepEqual(safeParseCache('{"ok":true}', parse), { ok: true });
});

test('orderPaymentMethodOptions offers only the methods the order-payment endpoint accepts', () => {
  assert.deepEqual(orderPaymentMethodOptions(['CASH', 'BANK TRANSFER', 'DIGITAL', 'EASYPAISA']), ['CASH', 'DIGITAL']);
  assert.deepEqual(orderPaymentMethodOptions([]), []);
  // Every option must pass the server's createPaymentSchema.
  return import('@tailor/shared').then(({ createPaymentSchema }) => {
    for (const method of orderPaymentMethodOptions(['CASH', 'BANK', 'DIGITAL', 'JAZZCASH'])) {
      assert.equal(createPaymentSchema.safeParse({ amount: '1.00', method }).success, true, method);
    }
  });
});
