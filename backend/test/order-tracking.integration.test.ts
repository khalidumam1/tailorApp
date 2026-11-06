/**
 * Customer order-tracking links (DB-backed).
 *
 * Covers the whole loop: staff create and share a link, the customer opens it
 * without an account, the customer sends a message back, the shop answers it,
 * and revoking the link closes the door again. Tenant isolation and the
 * `orders:share` permission are asserted as well, because a tracking link is
 * the one place where a mistake leaks another tenant's work.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { requireIsolatedTestDatabaseUrl } from '../src/testing/isolated-test-database.js';

const enabled = process.env.RUN_DB_TESTS === 'true';
if (enabled) {
  process.env.DATABASE_URL = requireIsolatedTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.ALLOW_SHARED_TEST_DATABASE === 'true',
  );
}
const prisma = new PrismaClient();

let closeServer: (() => Promise<void>) | undefined;
let baseUrl = '';
let businessAId = '';
let businessBId = '';
let orderAId = '';
let orderBId = '';
let authHeaderA = '';
let authHeaderAReadOnly = '';
let authHeaderB = '';
let userIds: string[] = [];

interface LinkPayload {
  id: string;
  token: string;
  path: string;
  url: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

interface TrackingPayload {
  business: { name: string; logoUrl: string | null; contactPhone: string | null; currency: string };
  customerName: string;
  order: {
    orderNumber: string;
    statusLabel: string;
    stageLabel: string | null;
    promisedAt: string;
    createdAt: string;
    total: string;
    paid: string;
    outstanding: string;
    currency: string;
    ready: boolean;
    items: Array<{ name: string; quantity: number; unitPrice: string; measurements: unknown }>;
    timeline: Array<{ label: string; at: string }>;
    messages: Array<{ id: string; kind: string; body: string | null; status: string; createdAt: string }>;
  };
}

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json() as Record<string, unknown>;
  return { status: response.status, body };
}

before(async () => {
  if (!enabled) return;
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
  process.env.CORS_ORIGINS ??= 'http://localhost:5173';
  process.env.LOG_LEVEL = 'silent';

  const suffix = randomUUID();
  const tailorTemplate = await prisma.businessTemplate.findUniqueOrThrow({
    where: { key: 'tailor' },
    select: { id: true },
  });
  const [businessA, businessB] = await Promise.all([
    prisma.business.create({
      data: { name: `Tracking A ${suffix}`, slug: `tracking-a-${suffix}`.slice(0, 80), status: 'ACTIVE', templateId: tailorTemplate.id },
    }),
    prisma.business.create({
      data: { name: `Tracking B ${suffix}`, slug: `tracking-b-${suffix}`.slice(0, 80), status: 'ACTIVE', templateId: tailorTemplate.id },
    }),
  ]);
  businessAId = businessA.id;
  businessBId = businessB.id;
  await prisma.businessConfiguration.create({
    data: {
      businessId: businessA.id,
      enabledModules: ['customers', 'measurements', 'orders', 'payments', 'reports', 'notifications'],
      contactPhone: '+923001234567',
    },
  });
  await prisma.businessConfiguration.create({
    data: {
      businessId: businessB.id,
      enabledModules: ['customers', 'measurements', 'orders', 'payments', 'reports', 'notifications'],
    },
  });

  const permissionKeys = ['orders:read', 'orders:write', 'orders:share'];
  const permissions = await Promise.all(permissionKeys.map((key) => prisma.permission.upsert({
    where: { key },
    update: {},
    create: { key, description: `${key} in the order tracking test` },
  })));
  const readOnlyPermission = await prisma.permission.upsert({
    where: { key: 'orders:read' },
    update: {},
    create: { key: 'orders:read', description: 'orders:read in the order tracking test' },
  });

  const [userA, userAReadOnly, userB] = await Promise.all([
    prisma.user.create({ data: { email: `tracking-a-${suffix}@example.test`, name: 'Tracking A', passwordHash: 'test-hash' } }),
    prisma.user.create({ data: { email: `tracking-ro-${suffix}@example.test`, name: 'Tracking Read Only', passwordHash: 'test-hash' } }),
    prisma.user.create({ data: { email: `tracking-b-${suffix}@example.test`, name: 'Tracking B', passwordHash: 'test-hash' } }),
  ]);
  userIds = [userA.id, userAReadOnly.id, userB.id];
  const [roleA, roleAReadOnly, roleB] = await Promise.all([
    prisma.role.create({ data: { businessId: businessA.id, name: `Tracking Role A ${suffix.slice(0, 8)}` } }),
    prisma.role.create({ data: { businessId: businessA.id, name: `Tracking Role RO ${suffix.slice(0, 8)}` } }),
    prisma.role.create({ data: { businessId: businessB.id, name: `Tracking Role B ${suffix.slice(0, 8)}` } }),
  ]);
  await prisma.rolePermissionGrant.createMany({
    data: permissions.map((permission) => ({ roleId: roleA.id, permissionId: permission.id })),
  });
  await prisma.rolePermissionGrant.create({
    data: { roleId: roleAReadOnly.id, permissionId: readOnlyPermission.id },
  });
  await prisma.rolePermissionGrant.createMany({
    data: permissions.map((permission) => ({ roleId: roleB.id, permissionId: permission.id })),
  });
  const [membershipA, membershipAReadOnly, membershipB] = await Promise.all([
    prisma.membership.create({ data: { businessId: businessA.id, userId: userA.id, roleId: roleA.id } }),
    prisma.membership.create({ data: { businessId: businessA.id, userId: userAReadOnly.id, roleId: roleAReadOnly.id } }),
    prisma.membership.create({ data: { businessId: businessB.id, userId: userB.id, roleId: roleB.id } }),
  ]);

  const [customerA, customerB] = await Promise.all([
    prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: 'Ali Raza Khan',
        // A different number than the shop's contact phone: the customer page
        // shows the shop's number on purpose, so the customer's own number
        // must be the one that never appears.
        phone: '+923005555555',
        phoneNormalized: '923005555555',
      },
    }),
    prisma.customer.create({
      data: { businessId: businessB.id, name: 'B Customer', phone: '+923007654321', phoneNormalized: '923007654321' },
    }),
  ]);
  const orderA = await prisma.order.create({
    data: {
      businessId: businessA.id,
      customerId: customerA.id,
      createdById: userA.id,
      orderNumber: `TA-${suffix.slice(0, 12)}`,
      promisedAt: new Date(Date.now() + 86_400_000),
      total: '5000.00',
      notes: 'Internal note: fabric cost is 1800',
    },
  });
  orderAId = orderA.id;
  const orderB = await prisma.order.create({
    data: {
      businessId: businessB.id,
      customerId: customerB.id,
      createdById: userB.id,
      orderNumber: `TB-${suffix.slice(0, 12)}`,
      promisedAt: new Date(Date.now() + 86_400_000),
      total: '1000.00',
    },
  });
  orderBId = orderB.id;
  await prisma.orderItem.create({
    data: {
      orderId: orderA.id,
      businessId: businessA.id,
      garmentName: 'Shirt',
      itemName: 'Shirt',
      quantity: 2,
      unitPrice: '2500.00',
      measurementSnapshot: { template: 'Shirt', revision: 1, values: { chest: '40', sleeve: '24' } },
    },
  });
  await prisma.payment.create({
    data: {
      businessId: businessA.id,
      orderId: orderA.id,
      recordedById: userA.id,
      amount: '2000.00',
      method: 'CASH',
      receiptNumber: `RC-${suffix.slice(0, 10)}`,
      idempotencyKey: randomUUID(),
    },
  });

  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is required for the order tracking test');
  // The raw token: the `api` helper adds the `Bearer ` prefix itself.
  const sign = (userId: string, membershipId: string) => jwt.sign(
    { scope: 'business', membershipId },
    secret,
    { subject: userId, issuer: 'tailor-api', audience: 'tailor-clients', expiresIn: '10m', algorithm: 'HS256' },
  );
  authHeaderA = sign(userA.id, membershipA.id);
  authHeaderAReadOnly = sign(userAReadOnly.id, membershipAReadOnly.id);
  authHeaderB = sign(userB.id, membershipB.id);

  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The order tracking test server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

after(async () => {
  if (!enabled) {
    await prisma.$disconnect();
    return;
  }
  await closeServer?.();
  const businessIds = [businessAId, businessBId].filter(Boolean);
  await prisma.orderCustomerMessage.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.orderTrackingLink.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.payment.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.orderItem.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.order.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.auditEvent.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.membership.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.rolePermissionGrant.deleteMany({ where: { role: { businessId: { in: businessIds } } } });
  await prisma.role.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.businessConfiguration.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('staff create a tracking link for an order', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  assert.equal(created.status, 201);
  const link = (created.body.data as { link: LinkPayload }).link;
  assert.match(link.token, /^[A-Za-z0-9_-]{32,64}$/);
  assert.equal(link.path, `/track/${link.token}`);
  assert.equal(link.viewCount, 0);
  assert.equal(link.revokedAt, null);

  // Asking again returns the same link, so the link the customer already has keeps working.
  const again = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  assert.equal(again.status, 201);
  assert.equal((again.body.data as { link: LinkPayload }).link.token, link.token);
});

test('the customer can follow the order without an account', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;

  const response = await api(`/api/v1/public/tracking/${link.token}`);
  assert.equal(response.status, 200);
  const tracking = response.body.data as TrackingPayload;
  assert.equal(tracking.order.orderNumber, (await prisma.order.findUniqueOrThrow({ where: { id: orderAId } })).orderNumber);
  assert.equal(tracking.order.total, '5000.00');
  assert.equal(tracking.order.paid, '2000.00');
  assert.equal(tracking.order.outstanding, '3000.00');
  assert.equal(tracking.order.items.length, 1);
  assert.equal(tracking.order.items[0].name, 'Shirt');
  assert.ok(tracking.order.timeline.length >= 1);

  // Only the first name is shown, and the internal note and phone never are.
  assert.equal(tracking.customerName, 'Ali');
  const serialized = JSON.stringify(tracking);
  assert.ok(!serialized.includes('fabric cost'), 'internal notes must not reach the customer page');
  assert.ok(!serialized.includes('923005555555'), 'the customer phone must not be exposed');
  assert.ok(!serialized.includes(orderBId), 'no other order may be reachable');
});

test('a customer message reaches the shop and can be answered', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;

  const sent = await api(`/api/v1/public/tracking/${link.token}/messages`, {
    method: 'POST',
    body: { kind: 'QUESTION', body: 'When will the shirt be ready?' },
  });
  assert.equal(sent.status, 201);

  const listed = await api(`/api/v1/orders/${orderAId}/customer-messages`, { token: authHeaderA });
  assert.equal(listed.status, 200);
  const messages = (listed.body.data as { messages: Array<{ id: string; kind: string; body: string | null; status: string }> }).messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'QUESTION');
  assert.equal(messages[0].body, 'When will the shirt be ready?');
  assert.equal(messages[0].status, 'OPEN');

  const resolved = await api(`/api/v1/orders/${orderAId}/customer-messages/${messages[0].id}`, {
    method: 'PATCH',
    token: authHeaderA,
    body: { status: 'RESOLVED' },
  });
  assert.equal(resolved.status, 200);
  const afterResolve = await api(`/api/v1/orders/${orderAId}/customer-messages`, { token: authHeaderA });
  const resolvedMessages = (afterResolve.body.data as { messages: Array<{ status: string }> }).messages;
  assert.equal(resolvedMessages[0].status, 'RESOLVED');
});

test('a question without a message is rejected', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;
  const response = await api(`/api/v1/public/tracking/${link.token}/messages`, {
    method: 'POST',
    body: { kind: 'QUESTION' },
  });
  assert.equal(response.status, 400);
});

test('a fitting confirmation needs no words', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;
  const response = await api(`/api/v1/public/tracking/${link.token}/messages`, {
    method: 'POST',
    body: { kind: 'FITTING_CONFIRMED' },
  });
  assert.equal(response.status, 201);
});

test('revoking the link closes the customer page', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;
  assert.equal((await api(`/api/v1/public/tracking/${link.token}`)).status, 200);

  const revoked = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'DELETE',
    token: authHeaderA,
  });
  assert.equal(revoked.status, 200);

  const afterRevoke = await api(`/api/v1/public/tracking/${link.token}`);
  assert.equal(afterRevoke.status, 404);
  assert.equal((afterRevoke.body.error as { code: string }).code, 'TRACKING_LINK_NOT_FOUND');
});

test('an unknown token is not found', async () => {
  const response = await api('/api/v1/public/tracking/not-a-real-token');
  assert.equal(response.status, 404);
});

test('another tenant cannot see or touch the link', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;

  const read = await api(`/api/v1/orders/${orderAId}/tracking-link`, { token: authHeaderB });
  assert.equal(read.status, 404);

  const messages = await api(`/api/v1/orders/${orderAId}/customer-messages`, { token: authHeaderB });
  assert.equal(messages.status, 404);

  const create = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderB,
    body: {},
  });
  assert.equal(create.status, 404);

  // The other tenant's own order still works — the block is per order.
  const own = await api(`/api/v1/orders/${orderBId}/tracking-link`, {
    method: 'POST',
    token: authHeaderB,
    body: {},
  });
  assert.equal(own.status, 201);
  const ownLink = (own.body.data as { link: LinkPayload }).link;
  assert.notEqual(ownLink.token, link.token);
});

test('a role without orders:share cannot create a link', async () => {
  const response = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderAReadOnly,
    body: {},
  });
  assert.equal(response.status, 403);
});

test('the shop can see how often the customer opened the link', async () => {
  const created = await api(`/api/v1/orders/${orderAId}/tracking-link`, {
    method: 'POST',
    token: authHeaderA,
    body: {},
  });
  const link = (created.body.data as { link: LinkPayload }).link;
  await api(`/api/v1/public/tracking/${link.token}`);
  await api(`/api/v1/public/tracking/${link.token}`);

  const read = await api(`/api/v1/orders/${orderAId}/tracking-link`, { token: authHeaderA });
  const current = (read.body.data as { link: LinkPayload }).link;
  assert.ok(current.viewCount >= 2, `expected at least 2 views, saw ${current.viewCount}`);
  assert.ok(current.lastViewedAt, 'the last view time is recorded');
});
