import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/tailor_test';
process.env.ACCESS_TOKEN_SECRET = 'test-only-secret-that-is-long-enough-to-pass';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';

const { app } = await import('../src/app.js');
let server: ReturnType<typeof app.listen>;
let baseUrl = '';

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('health endpoint reports service status without database access', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { status: string; service: string } };
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.service, 'tailor-api');
});

test('health endpoint supports the /backend deployment prefix', async () => {
  const response = await fetch(`${baseUrl}/backend/api/v1/health`);
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { status: string; service: string } };
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.service, 'tailor-api');
});

test('offline sync endpoints require a valid authenticated session', async () => {
  const response = await fetch(`${baseUrl}/backend/api/v1/sync/operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operations: [] }),
  });
  assert.equal(response.status, 401);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'UNAUTHENTICATED');
});

test('business configuration, notifications and template builder APIs require authentication', async () => {
  for (const [path, method] of [
    ['/api/v1/business/configuration', 'GET'],
    ['/api/v1/business/configuration/history', 'GET'],
    ['/api/v1/business/configuration/structure', 'PUT'],
    ['/api/v1/business/permissions', 'GET'],
    ['/api/v1/business/roles', 'GET'],
    ['/api/v1/business/staff', 'GET'],
    ['/api/v1/notifications', 'GET'],
    ['/api/v1/platform/templates', 'GET'],
    ['/api/v1/platform/templates/00000000-0000-4000-8000-000000000001/revisions', 'GET'],
    ['/api/v1/catalog', 'GET'],
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(method === 'PUT' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}),
    });
    assert.equal(response.status, 401, `${method} ${path} must require a session`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  }
});

test('unknown routes use the standard versioned error shape', async () => {
  const response = await fetch(`${baseUrl}/api/v1/not-a-route`);
  assert.equal(response.status, 404);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(body.error.message, 'Route not found');
});

test('CORS rejects origins not explicitly allowlisted', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(response.status, 403);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'CORS_ORIGIN_DENIED');
});

test('protected profile endpoint rejects missing credentials before database access', async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/me`);
  assert.equal(response.status, 401);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'UNAUTHENTICATED');
});

test('shop billing and platform billing APIs require authentication', async () => {
  for (const [path, method] of [
    ['/api/v1/subscriptions', 'GET'],
    ['/api/v1/subscriptions/payments', 'POST'],
    ['/api/v1/platform/billing/dashboard', 'GET'],
    ['/api/v1/platform/billing/plans', 'GET'],
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    assert.equal(response.status, 401, `${method} ${path} must require a session`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  }
});

test('login validates request shape before database access', async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});
