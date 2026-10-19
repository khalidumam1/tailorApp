import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, clearRefreshCache, parseNotificationTemplates } from './api';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BUSINESS_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';

type FetchCall = { url: string; init?: RequestInit };

let fetchCalls: FetchCall[] = [];

function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  fetchCalls = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    fetchCalls.push(call);
    return handler(call);
  });
}

function jsonResponse(status: number, payload: unknown, requestId = 'req-test-1'): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  });
}

function okData(data: unknown): Response {
  return jsonResponse(200, { data });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearRefreshCache();
});

describe('api.login', () => {
  it('parses a business session including mustChangePassword', async () => {
    stubFetch(() => okData({
      user: { id: USER_ID, name: 'Owner', email: 'owner@example.com' },
      business: { id: BUSINESS_ID, name: 'Rizwan Tailors' },
      mustChangePassword: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }));
    const result = await api.login('owner@example.com', 'secret-password');
    expect('accessToken' in result && result.accessToken).toBe('access-token');
    expect('mustChangePassword' in result && result.mustChangePassword).toBe(true);
    expect(fetchCalls[0].url).toBe('/api/v1/auth/login');
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      email: 'owner@example.com',
      password: 'secret-password',
    });
  });

  it('parses the scope-selection response variant', async () => {
    stubFetch(() => okData({
      requiresScopeSelection: true,
      canAccessPlatform: true,
      businesses: [{ id: BUSINESS_ID, name: 'Rizwan Tailors' }],
    }));
    const result = await api.login('admin@example.com', 'secret-password');
    expect('requiresScopeSelection' in result && result.requiresScopeSelection).toBe(true);
  });
});

describe('api.changePassword', () => {
  it('posts current/new passwords with the bearer token', async () => {
    stubFetch(() => okData({ passwordChanged: true, signInAgain: true }));
    const result = await api.changePassword('token-1', 'OldPassword123!', 'NewPassword123!');
    expect(result).toEqual({ passwordChanged: true, signInAgain: true });
    expect(fetchCalls[0].url).toBe('/api/v1/auth/password/change');
    const headers = new Headers(fetchCalls[0].init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token-1');
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    });
  });
});

describe('error mapping', () => {
  it('maps a server error envelope to ApiError with code, status and request id', async () => {
    stubFetch(() => jsonResponse(429, {
      error: { code: 'ACCOUNT_THROTTLED', message: 'Too many failed sign-in attempts.' },
    }, 'req-throttle'));
    await expect(api.login('a@b.example', 'x')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'ACCOUNT_THROTTLED',
      status: 429,
      requestId: 'req-throttle',
      message: 'Too many failed sign-in attempts.',
    });
  });

  it('falls back to a generic message when the error body is not an envelope', async () => {
    stubFetch(() => new Response('<html>oops</html>', { status: 500 }));
    await expect(api.login('a@b.example', 'x')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      status: 500,
    });
  });

  it('rejects a success response whose payload fails schema validation', async () => {
    stubFetch(() => okData({ user: { id: 'not-a-uuid' } }));
    await expect(api.login('a@b.example', 'x')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('maps a network failure to NETWORK_ERROR', async () => {
    stubFetch(() => { throw new TypeError('fetch failed'); });
    await expect(api.login('a@b.example', 'x')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('exposes ApiError instances for instanceof checks', async () => {
    stubFetch(() => jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'No.' } }));
    await expect(api.login('a@b.example', 'x')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('customers archive/restore queries (task 1.2)', () => {
  const customer = {
    id: CUSTOMER_ID,
    name: 'Ahmed',
    phone: '+923001234567',
    whatsappConsent: false,
    whatsappConsentAt: null,
    whatsappOptedOutAt: null,
    version: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('requests archived customers only when asked', async () => {
    stubFetch(() => okData({ items: [customer], nextCursor: null }));
    await api.customers('token-1', '', true);
    expect(fetchCalls[0].url).toContain('archived=true');
    await api.customers('token-1');
    expect(fetchCalls[1].url).not.toContain('archived=');
  });

  it('archives with DELETE + version and restores with POST + version', async () => {
    stubFetch((call) => (call.init?.method === 'DELETE'
      ? okData({ archived: true })
      : okData(customer)));
    await expect(api.archiveCustomer('token-1', customer as never)).resolves.toEqual({ archived: true });
    expect(fetchCalls[0].init?.method).toBe('DELETE');
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({ version: 3 });
    await api.restoreCustomer('token-1', customer as never);
    expect(fetchCalls[1].url).toBe(`/api/v1/customers/${CUSTOMER_ID}/restore`);
    expect(fetchCalls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(fetchCalls[1].init?.body))).toEqual({ version: 3 });
  });
});

describe('exports and invoice downloads (task 2.2)', () => {
  it('requests the orders export with the archived flag only when asked', async () => {
    stubFetch(() => new Response('a,b', { status: 200, headers: { 'content-type': 'text/csv' } }));
    await api.exportOrdersCsv('token-1', true);
    expect(fetchCalls[0].url).toBe('/api/v1/exports/orders.csv?archived=true');
    await api.exportOrdersCsv('token-1');
    expect(fetchCalls[1].url).toBe('/api/v1/exports/orders.csv');
  });

  it('requests the order invoice pdf', async () => {
    stubFetch(() => new Response('%PDF-fake', { status: 200, headers: { 'content-type': 'application/pdf' } }));
    const blob = await api.orderInvoice('token-1', CUSTOMER_ID);
    expect(fetchCalls[0].url).toBe(`/api/v1/orders/${CUSTOMER_ID}/invoice.pdf`);
    expect(await blob.text()).toContain('%PDF');
  });
});

describe('alterations (task 2.1)', () => {
  const alteration = {
    id: CUSTOMER_ID,
    orderId: CUSTOMER_ID,
    description: 'Shorten sleeves',
    status: 'OPEN',
    dueAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('lists, creates and completes alterations', async () => {
    stubFetch((call) => (call.init?.method === 'PATCH' || call.init?.method === 'POST'
      ? okData({ ...alteration, status: 'DONE' })
      : okData({ items: [alteration] })));
    const list = await api.alterations('token-1', CUSTOMER_ID);
    expect(list.items).toHaveLength(1);
    await api.setAlterationStatus('token-1', CUSTOMER_ID, CUSTOMER_ID, 'DONE');
    const patch = fetchCalls[1];
    expect(patch.init?.method).toBe('PATCH');
    expect(JSON.parse(String(patch.init?.body))).toEqual({ status: 'DONE' });
  });
});

describe('parseNotificationTemplates', () => {
  it('accepts known template keys and rejects unknown ones', () => {
    expect(parseNotificationTemplates({
      ORDER_CREATED: { enabled: true, body: 'Your order is confirmed.' },
    })).toEqual({ ORDER_CREATED: { enabled: true, body: 'Your order is confirmed.' } });
    expect(() => parseNotificationTemplates({
      NOT_A_TEMPLATE: { enabled: true, body: 'x' },
    })).toThrow();
  });
});
