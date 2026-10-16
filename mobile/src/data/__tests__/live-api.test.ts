/**
 * Scenario tests that run the mobile API client and request builders against a
 * running backend. They are skipped unless the environment is configured:
 *
 *   TAILOR_LIVE_API_URL=http://localhost:5000
 *   TAILOR_TEST_OWNER_EMAIL / TAILOR_TEST_OWNER_PASSWORD   (owner of the test business)
 *   TAILOR_TEST_STAFF_EMAIL / TAILOR_TEST_STAFF_PASSWORD   (tailor role: no payments access)
 *   TAILOR_TEST_BUSINESS                                    (optional, default "Tailor Demo")
 *
 * Run with `npm run test:live --workspace @tailor/mobile`. Credentials come from the
 * environment only and are never stored in the repository.
 */
import Module from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogRequest,
  buildOrderRequest,
  attemptFor,
  fetchAllPages,
  mapRemoteCustomer,
  mapRemoteOrder,
  subscriptionAmountFor,
  type RemoteCustomer,
  type RemoteOrder,
} from '../erp-mapping';
import { createClientId } from '../../local';

const LIVE_URL = process.env.TAILOR_LIVE_API_URL?.trim();
const OWNER_EMAIL = process.env.TAILOR_TEST_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.TAILOR_TEST_OWNER_PASSWORD;
const STAFF_EMAIL = process.env.TAILOR_TEST_STAFF_EMAIL;
const STAFF_PASSWORD = process.env.TAILOR_TEST_STAFF_PASSWORD;
const BUSINESS_NAME = process.env.TAILOR_TEST_BUSINESS ?? 'Tailor Demo';
const configured = Boolean(LIVE_URL && OWNER_EMAIL && OWNER_PASSWORD && STAFF_EMAIL && STAFF_PASSWORD);

// The API client reads its base URL at import time and needs an in-memory secure store
// instead of the native module. @tailor/shared exposes only the ESM "import" condition,
// so the built file is handed to the CommonJS loader directly.
const secureStore = new Map<string, string>();
const sharedModule = require('../../../../packages/shared/dist/index.js');
if (configured) {
  process.env.EXPO_PUBLIC_API_BASE_URL = LIVE_URL;
  const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
  (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function load(request: unknown, ...rest: unknown[]) {
    if (request === 'expo-secure-store') {
      return {
        getItemAsync: async (key: string) => secureStore.get(key) ?? null,
        setItemAsync: async (key: string, value: string) => { secureStore.set(key, value); },
        deleteItemAsync: async (key: string) => { secureStore.delete(key); },
      };
    }
    if (request === '@tailor/shared') return sharedModule;
    return originalLoad.call(this, request, ...rest);
  };
}

type Api = typeof import('../../api');
let api: Api;

const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const todayPlusDays = (days: number) => new Date(Date.now() + 5 * 60 * 60 * 1000 + days * 86_400_000)
  .toISOString().slice(0, 10);

async function signInBusiness(email: string, password: string, businessName: string) {
  const first = await api.signIn(email, password);
  if (!('requiresBusinessSelection' in first) || !first.requiresBusinessSelection) {
    if ('accessToken' in first) return api.createSession(first);
    throw new Error('Unexpected sign-in response');
  }
  const choice = first.businesses.find((business) => business.name === businessName);
  assert.ok(choice, `business "${businessName}" is not available to ${email}`);
  const selected = await api.signIn(email, password, choice.id);
  assert.ok('accessToken' in selected, 'business selection should return a session');
  return api.createSession(selected);
}

describe('live API scenarios', {
  skip: configured ? false : 'Set TAILOR_LIVE_API_URL and the TAILOR_TEST_* credentials to run',
}, () => {
  let owner: Awaited<ReturnType<Api['createSession']>>;
  let staff: Awaited<ReturnType<Api['createSession']>>;
  let customerId = '';
  let customerName = '';
  let orderId = '';
  let orderVersion = 0;
  let orderTotal = '';
  let initialStageKey = 'NEW';
  let firstStageTransition: { toStageKey: string } | null = null;

  it('loads the API client and signs the owner in through business selection', async () => {
    api = await import('../../api');
    owner = await signInBusiness(OWNER_EMAIL!, OWNER_PASSWORD!, BUSINESS_NAME);
    assert.equal(owner.business.name, BUSINESS_NAME);
    assert.ok(owner.permissions.includes('orders:write'));
    assert.ok(owner.permissions.includes('payments:write'));
  });

  it('parses the live business configuration with the app parser', async () => {
    const response = await api.apiRequest<{ data: unknown }>(owner, '/api/v1/business/configuration');
    const config = api.parseBusinessConfiguration(response.data);
    assert.equal(config.business.id, owner.business.id);
    const initial = config.workflow.stages.find((stage) => stage.isInitial);
    assert.ok(initial, 'workflow has an initial stage');
    initialStageKey = initial.key;
    assert.ok(config.itemTypes.some((item) => item.key === 'garment'));
    const transition = config.workflow.transitions.find((item) => item.fromStageId === initial.id);
    assert.ok(transition, 'initial stage has an outgoing transition');
    const target = config.workflow.stages.find((stage) => stage.id === transition.toStageId);
    firstStageTransition = { toStageKey: target!.key };
  });

  it('creates a customer and reads it back with the mapped local fields', async () => {
    customerName = `Live Customer ${uniqueSuffix()}`;
    const phone = `+92300${Math.floor(1000000 + Math.random() * 8999999)}`;
    const created = await api.apiRequest<{ data: RemoteCustomer }>(owner, '/api/v1/customers', {
      method: 'POST',
      body: { name: customerName, phone, notes: '', customFields: {} },
    });
    customerId = created.data.id;
    const customers = await fetchAllPages<RemoteCustomer>(async (cursor) => {
      const page = await api.apiRequest<{ data: { items: RemoteCustomer[]; nextCursor?: string | null } }>(
        owner,
        `/api/v1/customers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      return page.data;
    });
    const local = customers.map(mapRemoteCustomer).find((item) => item.id === customerId);
    assert.ok(local, 'created customer is listed');
    assert.equal(local.name, customerName);
    assert.equal(local.custom_fields_json, '{}');
  });

  it('rejects a duplicate phone number with a readable error', async () => {
    const existing = await api.apiRequest<{ data: { items: RemoteCustomer[] } }>(owner, '/api/v1/customers?limit=100');
    const target = existing.data.items.find((item) => item.id === customerId);
    assert.ok(target);
    await assert.rejects(
      api.apiRequest(owner, '/api/v1/customers', {
        method: 'POST',
        body: { name: 'Duplicate', phone: target.phone, notes: '', customFields: {} },
      }),
      (error: unknown) => error instanceof api.ApiError && error.status >= 400 && error.status < 500,
    );
  });

  it('creates an order from the form body and replays the same key without a second order', async () => {
    const body = buildOrderRequest({
      customerId,
      itemTypeKey: 'garment',
      itemName: 'Live Kurta',
      quantity: '2',
      unitPrice: '1500.50',
      dueDate: todayPlusDays(7),
      notes: '',
      orderCustomFields: {},
      itemCustomFields: {},
    });
    const key = createClientId();
    const first = await api.apiRequest<{ data: RemoteOrder }>(owner, '/api/v1/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body,
    });
    orderId = first.data.id;
    const replay = await api.apiRequest<{ data: RemoteOrder; replayed?: boolean }>(owner, '/api/v1/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.data.id, orderId);
  });

  it('rejects an order without an Idempotency-Key (the old app request)', async () => {
    const body = buildOrderRequest({
      customerId, itemTypeKey: 'garment', itemName: 'No key', quantity: '1', unitPrice: '100',
      dueDate: todayPlusDays(3), notes: '', orderCustomFields: {}, itemCustomFields: {},
    });
    await assert.rejects(
      api.apiRequest(owner, '/api/v1/orders', { method: 'POST', body }),
      (error: unknown) => error instanceof api.ApiError && error.code === 'IDEMPOTENCY_KEY_REQUIRED',
    );
  });

  it('lists the order and maps it to the fields the screens read', async () => {
    const page = await api.apiRequest<{ data: { items: RemoteOrder[] } }>(owner, '/api/v1/orders?limit=100');
    const remote = page.data.items.find((item) => item.id === orderId);
    assert.ok(remote, 'created order is listed');
    const local = mapRemoteOrder(remote);
    assert.equal(local.customer_id, customerId);
    assert.equal(local.customer_name, customerName);
    assert.equal(typeof local.promised_at, 'string');
    assert.equal(local.promised_at.slice(0, 4).length, 4);
    assert.equal(local.garment_name, 'Live Kurta');
    assert.equal(local.quantity, 2);
    // The API serialises the Decimal total without trailing zeros; compare numerically.
    assert.equal(Number(local.total), 3001);
    assert.ok(local.version >= 1, 'workflow transitions need a positive version');
    orderVersion = local.version;
    orderTotal = local.total;
  });

  it('moves the order to the next workflow stage and rejects a stale version', async () => {
    assert.ok(firstStageTransition);
    await api.apiRequest(owner, `/api/v1/orders/${orderId}/workflow`, {
      method: 'POST',
      body: { toStageKey: firstStageTransition.toStageKey, version: orderVersion },
    });
    await assert.rejects(
      api.apiRequest(owner, `/api/v1/orders/${orderId}/workflow`, {
        method: 'POST',
        body: { toStageKey: firstStageTransition.toStageKey, version: orderVersion },
      }),
      (error: unknown) => error instanceof api.ApiError && error.status === 409,
    );
    assert.notEqual(initialStageKey, firstStageTransition.toStageKey);
  });

  it('records a partial payment once when the retry reuses the attempt key', async () => {
    const fingerprint = JSON.stringify({ orderId, amount: '1000.00', method: 'CASH' });
    const attempt = attemptFor(null, fingerprint, createClientId);
    const retry = attemptFor(attempt, fingerprint, createClientId);
    assert.equal(retry.key, attempt.key);
    const body = { amount: '1000.00', method: 'CASH' };
    await api.apiRequest(owner, `/api/v1/payments/orders/${orderId}`, {
      method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body,
    });
    const replay = await api.apiRequest<{ replayed?: boolean }>(owner, `/api/v1/payments/orders/${orderId}`, {
      method: 'POST', headers: { 'Idempotency-Key': retry.key }, body,
    });
    assert.equal(replay.replayed, true, 'the retry is a replay, not a second payment');

    const page = await api.apiRequest<{ data: { items: RemoteOrder[] } }>(owner, '/api/v1/orders?limit=100');
    const remote = page.data.items.find((item) => item.id === orderId) as RemoteOrder & { paid?: string; outstanding?: string };
    assert.equal(remote.paid, '1000.00');
    assert.equal(remote.outstanding, (Number(orderTotal) - 1000).toFixed(2));
  });

  it('refuses to reuse a payment key for a different amount', async () => {
    const key = createClientId();
    await api.apiRequest(owner, `/api/v1/payments/orders/${orderId}`, {
      method: 'POST', headers: { 'Idempotency-Key': key }, body: { amount: '100.00', method: 'CASH' },
    });
    await assert.rejects(
      api.apiRequest(owner, `/api/v1/payments/orders/${orderId}`, {
        method: 'POST', headers: { 'Idempotency-Key': key }, body: { amount: '200.00', method: 'CASH' },
      }),
      (error: unknown) => error instanceof api.ApiError && error.status === 409,
    );
  });

  it('saves catalog items with blank price and SKU and pages through the list', async () => {
    const sharedBody = { typeKey: 'garment', description: '', sku: '', unit: '', unitPrice: '', sortOrder: 0, customFields: {} };
    const first = await api.apiRequest(owner, '/api/v1/catalog', {
      method: 'POST', body: buildCatalogRequest({ ...sharedBody, name: `Blank A ${uniqueSuffix()}` }),
    });
    const second = await api.apiRequest(owner, '/api/v1/catalog', {
      method: 'POST', body: buildCatalogRequest({ ...sharedBody, name: `Blank B ${uniqueSuffix()}` }),
    });
    assert.ok(first && second);
    await assert.rejects(
      api.apiRequest(owner, '/api/v1/catalog', {
        method: 'POST', body: { ...sharedBody, name: 'Old blank price', unitPrice: '' },
      }),
      (error: unknown) => error instanceof api.ApiError && error.status === 400,
    );

    const everything = await api.apiRequest<{ data: { items: Array<{ id: string; version: number; active: boolean }> } }>(
      owner, '/api/v1/catalog?limit=100',
    );
    const paged = await fetchAllPages<{ id: string }>(async (cursor) => {
      const page = await api.apiRequest<{ data: { items: Array<{ id: string }>; nextCursor?: string | null } }>(
        owner, `/api/v1/catalog?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      return page.data;
    });
    assert.deepEqual(
      paged.map((item) => item.id).sort(),
      everything.data.items.map((item) => item.id).sort(),
      'paged catalog matches the full list',
    );

    const target = everything.data.items[0]!;
    await api.apiRequest(owner, `/api/v1/catalog/${target.id}`, {
      method: 'PATCH', body: { version: target.version, active: !target.active },
    });
    await api.apiRequest(owner, `/api/v1/catalog/${target.id}`, {
      method: 'PATCH', body: { version: target.version + 1, active: target.active },
    });
  });

  it('saves a measurement revision built from the template fields', async () => {
    const templates = await api.apiRequest<{ data: { items: Array<{ id: string; fields: Array<{ key: string; required: boolean }> }> } }>(
      owner, '/api/v1/measurements/templates',
    );
    const template = templates.data.items.find((item) => Array.isArray(item.fields) && item.fields.length > 0);
    assert.ok(template, 'at least one measurement template exists');
    const values: Record<string, string> = {};
    for (const field of template.fields) values[field.key] = '36';
    await api.apiRequest(owner, `/api/v1/measurements/customers/${customerId}/revisions`, {
      method: 'POST',
      body: { garmentTemplateId: template.id, values, notes: '', measuredAt: new Date().toISOString() },
    });
    const profiles = await api.apiRequest<{ data: { items: Array<{ revisions: Array<{ values: Record<string, unknown> }> }> } }>(
      owner, `/api/v1/measurements/customers/${customerId}`,
    );
    assert.ok(profiles.data.items.some((profile) => profile.revisions.length > 0));
  });

  it('loads the dashboard and notification history for the owner', async () => {
    const dashboard = await api.apiRequest<{ data: Record<string, unknown> }>(owner, '/api/v1/reports/dashboard');
    assert.equal(typeof dashboard.data, 'object');
    const notifications = await api.apiRequest<{ data?: { items?: unknown[] } }>(owner, '/api/v1/notifications?limit=50');
    assert.ok(Array.isArray(notifications.data?.items));
  });

  it('a tailor without payment access gets PERMISSION_DENIED and stays signed in', async () => {
    staff = await signInBusiness(STAFF_EMAIL!, STAFF_PASSWORD!, BUSINESS_NAME);
    assert.equal(staff.permissions.includes('payments:read'), false);
    await assert.rejects(
      api.apiRequest(staff, '/api/v1/payments?limit=100'),
      (error: unknown) => error instanceof api.ApiError && error.code === 'PERMISSION_DENIED',
    );
    const stillSignedIn = await api.apiRequest<{ data: { user: { email: string } } }>(staff, '/api/v1/auth/me');
    assert.equal(stillSignedIn.data.user.email, STAFF_EMAIL);
    assert.ok(await api.readSession(), 'a permission error must not clear the stored session');
  });

  it('a tailor can read the orders and customers the app loads on sign-in', async () => {
    const orders = await api.apiRequest<{ data: { items: RemoteOrder[] } }>(staff, '/api/v1/orders?limit=100');
    assert.ok(Array.isArray(orders.data.items));
    const customers = await api.apiRequest<{ data: { items: RemoteCustomer[] } }>(staff, '/api/v1/customers?limit=100');
    assert.ok(Array.isArray(customers.data.items));
  });

  it('a subscription payment for the yearly cycle uses the yearly plan price', async () => {
    const billing = await api.apiRequest<{ data: {
      plans: Array<{ id: string; monthlyPrice: string; yearlyPrice: string }>;
      paymentMethods: string[];
    } }>(owner, '/api/v1/subscriptions');
    const method = billing.data.paymentMethods[0];
    assert.ok(method, 'a subscription payment method exists');
    const paid = billing.data.plans.find((item) => Number(item.yearlyPrice) > 0 && item.monthlyPrice !== item.yearlyPrice);
    const plan = paid ?? billing.data.plans[0];
    assert.ok(plan, 'a subscription plan exists');
    const base = {
      planId: plan.id,
      cycle: 'YEARLY',
      transactionReference: `LIVE-${uniqueSuffix()}`,
      senderName: 'Live Tester',
      method,
      paymentDate: todayPlusDays(0),
    };
    const amount = subscriptionAmountFor(billing.data.plans, plan.id, 'YEARLY');
    assert.equal(amount, plan.yearlyPrice);
    if (!paid) {
      // Only free plans are configured: the app must not be able to submit a payment for them.
      await assert.rejects(
        api.apiRequest(owner, '/api/v1/subscriptions/payments', { method: 'POST', body: { ...base, amount: amount! } }),
        (error: unknown) => error instanceof api.ApiError && error.code === 'PAYMENT_AMOUNT_MISMATCH',
      );
      return;
    }
    // The previous app sent the monthly price for every cycle.
    await assert.rejects(
      api.apiRequest(owner, '/api/v1/subscriptions/payments', {
        method: 'POST', body: { ...base, amount: plan.monthlyPrice },
      }),
      (error: unknown) => error instanceof api.ApiError && error.code === 'PAYMENT_AMOUNT_MISMATCH',
    );
    await api.apiRequest(owner, '/api/v1/subscriptions/payments', {
      method: 'POST', body: { ...base, amount: amount! },
    });
  });

  it('an expired access token is renewed transparently and the new session is persisted', async () => {
    const expired = { ...owner, accessExpiresAt: Date.now() - 60_000 };
    let renewed: typeof owner | null = null;
    const profile = await api.apiRequest<{ data: { user: { email: string } } }>(
      expired, '/api/v1/auth/me', {}, (next) => { renewed = next; },
    );
    assert.equal(profile.data.user.email, OWNER_EMAIL);
    assert.ok(renewed, 'the renewed session is reported to the caller');
    assert.notEqual((renewed as unknown as typeof owner).refreshToken, owner.refreshToken);
  });

  // Last on purpose: it revokes the owner session that the other scenarios use. The
  // sign-in endpoint allows 10 attempts per 15 minutes, so this suite does not log in again.
  it('signing out revokes the refresh token', async () => {
    await api.revokeSession(owner.refreshToken);
    const response = await fetch(`${LIVE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: owner.refreshToken }),
    });
    assert.equal(response.status, 401);
  });
});
