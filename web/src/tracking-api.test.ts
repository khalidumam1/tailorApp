import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { trackingApi } from './tracking-api';

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

function okData(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-test-1' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('customer tracking links', () => {
  const link = {
    id: CUSTOMER_ID,
    token: 'abcdefghijklmnopqrstuvwxyz0123456789AB',
    path: '/track/abcdefghijklmnopqrstuvwxyz0123456789AB',
    url: 'https://app.example.com/track/abcdefghijklmnopqrstuvwxyz0123456789AB',
    createdAt: '2026-01-01T00:00:00.000Z',
    revokedAt: null,
    lastViewedAt: null,
    viewCount: 0,
  };

  it('creates, reads and revokes the tracking link of an order', async () => {
    stubFetch((call) => (call.init?.method === 'DELETE'
      ? okData({ revoked: true })
      : okData({ link })));
    const created = await trackingApi.create('token-1', CUSTOMER_ID);
    expect(created.link.path).toBe(link.path);
    expect(fetchCalls[0].init?.method).toBe('POST');
    const read = await trackingApi.link('token-1', CUSTOMER_ID);
    expect(read.link?.token).toBe(link.token);
    await trackingApi.revoke('token-1', CUSTOMER_ID);
    expect(fetchCalls[2].init?.method).toBe('DELETE');
  });

  it('reads and answers customer messages', async () => {
    stubFetch((call) => (call.init?.method === 'PATCH'
      ? okData({ updated: true, message: { id: CUSTOMER_ID, orderId: CUSTOMER_ID, kind: 'QUESTION', body: 'When?', status: 'RESOLVED', createdAt: '2026-01-01T00:00:00.000Z', resolvedAt: null } })
      : okData({ messages: [{ id: CUSTOMER_ID, orderId: CUSTOMER_ID, kind: 'QUESTION', body: 'When?', status: 'OPEN', createdAt: '2026-01-01T00:00:00.000Z', resolvedAt: null }] })));
    const listed = await trackingApi.messages('token-1', CUSTOMER_ID);
    expect(listed.messages[0].kind).toBe('QUESTION');
    const updated = await trackingApi.setMessageStatus('token-1', CUSTOMER_ID, CUSTOMER_ID, 'RESOLVED');
    expect(updated.message?.status).toBe('RESOLVED');
    expect(JSON.parse(String(fetchCalls[1].init?.body))).toEqual({ status: 'RESOLVED' });
  });

  it('opens the public tracking page without a session and sends a customer message', async () => {
    const tracking = {
      business: { name: 'Rizwan Tailors', logoUrl: null, contactPhone: '+923001234567', currency: 'PKR' },
      customerName: 'Ali',
      order: {
        orderNumber: 'KARACHI-000001',
        statusLabel: 'Stitching',
        stageLabel: 'Stitching',
        promisedAt: '2026-01-05T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        total: '5000.00',
        paid: '2000.00',
        outstanding: '3000.00',
        currency: 'PKR',
        ready: false,
        items: [{ name: 'Shirt', quantity: 2, unitPrice: '2500.00', measurements: { template: 'Shirt', values: { chest: '40' } } }],
        timeline: [{ label: 'Order placed', at: '2026-01-01T00:00:00.000Z' }],
        messages: [],
      },
    };
    stubFetch((call) => (call.init?.method === 'POST'
      ? okData({ message: { id: CUSTOMER_ID, kind: 'QUESTION', body: 'When?', status: 'OPEN', createdAt: '2026-01-01T00:00:00.000Z' } })
      : okData(tracking)));
    const loaded = await trackingApi.publicOrder('token-1');
    expect(loaded.order.outstanding).toBe('3000.00');
    expect(fetchCalls[0].url).toBe('/api/v1/public/tracking/token-1');
    expect(fetchCalls[0].init?.headers).not.toHaveProperty('authorization');
    await trackingApi.sendPublicMessage('token-1', { kind: 'QUESTION', body: 'When?' });
    expect(JSON.parse(String(fetchCalls[1].init?.body))).toEqual({ kind: 'QUESTION', body: 'When?' });
  });

  it('rejects a tracking payload that does not match the contract', async () => {
    stubFetch(() => okData({ business: {}, customerName: 'Ali', order: {} }));
    await expect(trackingApi.publicOrder('token-1')).rejects.toBeInstanceOf(ApiError);
  });
});
