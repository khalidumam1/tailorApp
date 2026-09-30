import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const enabled = process.env.RUN_DB_TESTS === 'true';
const prisma = new PrismaClient();
let closeServer: (() => Promise<void>) | undefined;
let authHeader = '';
let baseUrl = '';
let businessAId = '';
let businessBId = '';
let customerAId = '';
let customerBId = '';
let orderBId = '';
let userAId = '';
let userBId = '';
let platformStaffId = '';
let assignedOwnerId = '';
let roleAId = '';
let roleBId = '';
let platformReadPermissionId = '';

before(async () => {
  if (!enabled) return;
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
  process.env.CORS_ORIGINS ??= 'http://localhost:5173';
  process.env.LOG_LEVEL = 'silent';
  if (!process.env.DATABASE_URL) throw new Error('RUN_DB_TESTS=true requires DATABASE_URL');

  const suffix = randomUUID();
  const [businessA, businessB] = await Promise.all([
    prisma.business.create({ data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}`.slice(0, 80), status: 'ACTIVE' } }),
    prisma.business.create({ data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}`.slice(0, 80), status: 'ACTIVE' } }),
  ]);
  businessAId = businessA.id;
  businessBId = businessB.id;
  const permissions = await Promise.all([
    prisma.permission.upsert({
      where: { key: 'customers:read' },
      update: {},
      create: { key: 'customers:read', description: 'View customers in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'customers:write' },
      update: {},
      create: { key: 'customers:write', description: 'Edit customers in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'orders:read' },
      update: {},
      create: { key: 'orders:read', description: 'View orders in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'orders:write' },
      update: {},
      create: { key: 'orders:write', description: 'Create orders in tenant isolation test' },
    }),
  ]);
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `tenant-a-${suffix}@example.test`, name: 'Tenant A User', passwordHash: 'test-hash' } }),
    prisma.user.create({ data: { email: `tenant-b-${suffix}@example.test`, name: 'Tenant B User', passwordHash: 'test-hash' } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  const platformStaff = await prisma.user.create({
    data: {
      email: `platform-staff-${suffix}@example.test`,
      name: 'Platform Staff',
      passwordHash: 'test-hash',
      platformRole: 'PLATFORM_STAFF',
    },
  });
  platformStaffId = platformStaff.id;
  const platformReadPermission = await prisma.permission.upsert({
    where: { key: 'platform:businesses:read' },
    update: {},
    create: { key: 'platform:businesses:read', description: 'View businesses in tenant isolation test' },
  });
  platformReadPermissionId = platformReadPermission.id;
  const [roleA, roleB] = await Promise.all([
    prisma.role.create({ data: { businessId: businessA.id, name: `Role A ${suffix}` } }),
    prisma.role.create({ data: { businessId: businessB.id, name: `Role B ${suffix}` } }),
  ]);
  roleAId = roleA.id;
  roleBId = roleB.id;
  await prisma.rolePermissionGrant.createMany({
    data: permissions.map((permission) => ({ roleId: roleA.id, permissionId: permission.id })),
  });
  const [membershipA] = await Promise.all([
    prisma.membership.create({ data: { businessId: businessA.id, userId: userA.id, roleId: roleA.id } }),
    prisma.membership.create({ data: { businessId: businessB.id, userId: userB.id, roleId: roleB.id } }),
  ]);
  const [customerA, customerB] = await Promise.all([
    prisma.customer.create({
      data: { businessId: businessA.id, name: 'A Customer', phone: '03001234567', phoneNormalized: `92${suffix.slice(0, 10)}` },
    }),
    prisma.customer.create({
      data: { businessId: businessB.id, name: 'B Customer', phone: '03007654321', phoneNormalized: `92${suffix.slice(10, 20)}` },
    }),
  ]);
  customerAId = customerA.id;
  customerBId = customerB.id;
  const orderB = await prisma.order.create({
    data: {
      businessId: businessB.id,
      customerId: customerB.id,
      createdById: userB.id,
      orderNumber: `TB-${suffix.slice(0, 12)}`,
      promisedAt: new Date(Date.now() + 86400000),
      total: '1000.00',
    },
  });
  orderBId = orderB.id;

  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is required for tenant isolation tests');
  authHeader = `Bearer ${jwt.sign(
    { scope: 'business', membershipId: membershipA.id },
    secret,
    { subject: userA.id, issuer: 'tailor-api', audience: 'tailor-clients', expiresIn: '5m', algorithm: 'HS256' },
  )}`;
  const platformToken = jwt.sign(
    { scope: 'platform' },
    secret,
    { subject: platformStaff.id, issuer: 'tailor-api', audience: 'tailor-clients', expiresIn: '5m', algorithm: 'HS256' },
  );
  process.env.TENANT_TEST_PLATFORM_TOKEN = platformToken;
  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Tenant isolation test server did not bind');
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
  await prisma.order.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.auditEvent.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.membership.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.rolePermissionGrant.deleteMany({ where: { roleId: { in: [roleAId, roleBId] } } });
  await prisma.role.deleteMany({ where: { id: { in: [roleAId, roleBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  if (assignedOwnerId) await prisma.user.delete({ where: { id: assignedOwnerId } });
  await prisma.user.delete({ where: { id: platformStaffId } });
  await prisma.business.deleteMany({ where: { id: { in: [businessAId, businessBId] } } });
  await prisma.$disconnect();
});

test('business queries and mutations remain scoped to the authenticated membership', { skip: !enabled }, async () => {
  const listResponse = await fetch(`${baseUrl}/api/v1/customers?businessId=${businessBId}`, {
    headers: { authorization: authHeader },
  });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json() as { data: { items: Array<{ id: string; businessId: string }> } };
  assert.deepEqual(list.data.items.map((customer) => customer.id), [customerAId]);
  assert.equal(list.data.items[0]?.businessId, businessAId);

  const foreignCustomer = await fetch(`${baseUrl}/api/v1/customers/${customerBId}`, {
    headers: { authorization: authHeader },
  });
  assert.equal(foreignCustomer.status, 404);

  const forgedCreate = await fetch(`${baseUrl}/api/v1/customers`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      businessId: businessBId,
      name: 'Created inside tenant A',
      phone: '03001230001',
    }),
  });
  assert.equal(forgedCreate.status, 201);
  const created = await forgedCreate.json() as { data: { businessId: string } };
  assert.equal(created.data.businessId, businessAId);

  const foreignOrder = await fetch(`${baseUrl}/api/v1/orders/${orderBId}`, {
    headers: { authorization: authHeader },
  });
  assert.equal(foreignOrder.status, 404);

  const crossTenantOrder = await fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      businessId: businessBId,
      customerId: customerBId,
      promisedAt: new Date(Date.now() + 86400000).toISOString(),
      items: [{ garmentName: 'Shirt', quantity: 1, unitPrice: '1000.00' }],
    }),
  });
  assert.equal(crossTenantOrder.status, 404);
});

test('membership foreign key prevents assigning a role owned by another business', { skip: !enabled }, async () => {
  await assert.rejects(prisma.membership.create({
    data: { businessId: businessAId, userId: userBId, roleId: roleBId },
  }));
});

test('platform role alone is insufficient; an explicit platform permission is required', { skip: !enabled }, async () => {
  const token = process.env.TENANT_TEST_PLATFORM_TOKEN;
  if (!token) throw new Error('Platform staff test token was not initialized');
  const withoutGrant = await fetch(`${baseUrl}/api/v1/platform/businesses`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(withoutGrant.status, 403);

  await prisma.platformPermissionGrant.create({
    data: { userId: platformStaffId, permissionId: platformReadPermissionId },
  });
  const withGrant = await fetch(`${baseUrl}/api/v1/platform/businesses`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(withGrant.status, 200);
  const result = await withGrant.json() as { data: { items: Array<{ id: string }> } };
  assert.ok(result.data.items.some((business) => business.id === businessAId));
});

test('platform owner assignment creates its role permissions within a transaction', { skip: !enabled }, async () => {
  const token = process.env.TENANT_TEST_PLATFORM_TOKEN;
  if (!token) throw new Error('Platform staff test token was not initialized');
  const managePermission = await prisma.permission.upsert({
    where: { key: 'platform:businesses:manage' },
    update: {},
    create: { key: 'platform:businesses:manage', description: 'Manage businesses in owner assignment test' },
  });
  await prisma.platformPermissionGrant.create({
    data: { userId: platformStaffId, permissionId: managePermission.id },
  });
  const suffix = randomUUID();
  const response = await fetch(`${baseUrl}/api/v1/platform/businesses/${businessAId}/owners`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Assigned Owner',
      email: `assigned-owner-${suffix}@example.test`,
      initialPassword: 'test-owner-password-12345',
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { data: { owner: { id: string }; membershipId: string } };
  assignedOwnerId = body.data.owner.id;
  const membership = await prisma.membership.findUnique({
    where: { id: body.data.membershipId },
    include: { role: { include: { grants: true } } },
  });
  assert.equal(membership?.role.grants.length, 14);
});
