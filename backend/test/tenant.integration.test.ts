import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
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
let platformSuperAdminId = '';
let assignedOwnerId = '';
let roleAId = '';
let roleBId = '';
let platformReadPermissionId = '';
let offlineOrderId = '';
let subscriptionPlanId = '';
let subscriptionPaymentId = '';

before(async () => {
  if (!enabled) return;
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
  process.env.CORS_ORIGINS ??= 'http://localhost:5173';
  process.env.LOG_LEVEL = 'silent';
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-only-whatsapp-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-only-phone-id';
  process.env.WHATSAPP_VERIFY_TOKEN = 'test-only-verify-token';
  process.env.META_APP_SECRET = 'test-only-meta-app-secret';
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
    prisma.permission.upsert({
      where: { key: 'orders:transition' },
      update: {},
      create: { key: 'orders:transition', description: 'Transition orders in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'payments:write' },
      update: {},
      create: { key: 'payments:write', description: 'Post payments in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'notifications:read' },
      update: {},
      create: { key: 'notifications:read', description: 'Read notifications in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'subscriptions:read' },
      update: {},
      create: { key: 'subscriptions:read', description: 'Read subscriptions in tenant isolation test' },
    }),
    prisma.permission.upsert({
      where: { key: 'subscriptions:manage' },
      update: {},
      create: { key: 'subscriptions:manage', description: 'Submit subscription payments in tenant isolation test' },
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
  const platformSuperAdmin = await prisma.user.create({
    data: {
      email: `platform-super-${suffix}@example.test`,
      name: 'Platform Super Admin',
      passwordHash: 'test-hash',
      platformRole: 'SUPER_ADMIN',
    },
  });
  platformSuperAdminId = platformSuperAdmin.id;
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
  const defaultPlan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { active: true, isDefault: true } });
  const paymentPlan = await prisma.subscriptionPlan.create({
    data: {
      name: `Tenant test plan ${suffix.slice(0, 8)}`,
      monthlyPrice: '1200.00',
      yearlyPrice: '12000.00',
      trialDays: 0,
      features: { orders: true },
      limits: { ordersPerMonth: -1 },
    },
  });
  subscriptionPlanId = paymentPlan.id;
  const startsAt = new Date(Date.now() - 86_400_000);
  const endsAt = new Date(Date.now() + 30 * 86_400_000);
  await prisma.subscription.createMany({
    data: [businessA.id, businessB.id].map((businessId) => ({
      businessId,
      planId: defaultPlan.id,
      status: 'ACTIVE' as const,
      cycle: 'MONTHLY' as const,
      startsAt,
      endsAt,
      graceUntil: new Date(endsAt.getTime() + 7 * 86_400_000),
    })),
  });
  await prisma.rolePermissionGrant.createMany({
    data: permissions.map((permission) => ({ roleId: roleA.id, permissionId: permission.id })),
  });
  await prisma.rolePermissionGrant.createMany({
    data: permissions.map((permission) => ({ roleId: roleB.id, permissionId: permission.id })),
  });
  const [membershipA] = await Promise.all([
    prisma.membership.create({ data: { businessId: businessA.id, userId: userA.id, roleId: roleA.id } }),
    prisma.membership.create({ data: { businessId: businessB.id, userId: userB.id, roleId: roleB.id } }),
  ]);
  const [customerA, customerB] = await Promise.all([
    prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: 'A Customer',
        phone: '+923001234567',
        phoneNormalized: '923001234567',
        whatsappConsent: true,
        whatsappConsentAt: new Date(),
      },
    }),
    prisma.customer.create({
      data: { businessId: businessB.id, name: 'B Customer', phone: '+923007654321', phoneNormalized: '923007654321' },
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
  process.env.TENANT_TEST_SUPER_ADMIN_TOKEN = jwt.sign(
    { scope: 'platform' },
    secret,
    { subject: platformSuperAdmin.id, issuer: 'tailor-api', audience: 'tailor-clients', expiresIn: '5m', algorithm: 'HS256' },
  );
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
  await prisma.subscriptionEvent.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.subscriptionPayment.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.subscription.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  if (subscriptionPlanId) await prisma.subscriptionPlan.delete({ where: { id: subscriptionPlanId } });
  await prisma.whatsAppNotification.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.payment.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.order.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.auditEvent.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.membership.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.rolePermissionGrant.deleteMany({ where: { roleId: { in: [roleAId, roleBId] } } });
  await prisma.role.deleteMany({ where: { id: { in: [roleAId, roleBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  if (assignedOwnerId) await prisma.user.delete({ where: { id: assignedOwnerId } });
  await prisma.user.delete({ where: { id: platformStaffId } });
  await prisma.user.delete({ where: { id: platformSuperAdminId } });
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

test('subscription payment review is tenant-scoped, idempotent and required before activation', { skip: !enabled }, async () => {
  const suffix = randomUUID();
  const foreignPayment = await prisma.subscriptionPayment.create({
    data: {
      businessId: businessBId,
      planId: subscriptionPlanId,
      submittedById: userBId,
      cycle: 'MONTHLY',
      transactionReference: `FOREIGN-${suffix}`,
      senderName: 'Tenant B Sender',
      amount: '1200.00',
      method: 'BANK TRANSFER',
      paymentDate: new Date(),
      status: 'PENDING',
    },
  });
  const before = await prisma.subscription.count({ where: { businessId: businessAId } });
  const historyResponse = await fetch(`${baseUrl}/api/v1/subscriptions`, { headers: { authorization: authHeader } });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json() as { data: { payments: Array<{ id: string }> } };
  assert.equal(history.data.payments.some((payment) => payment.id === foreignPayment.id), false);

  const submission = {
    planId: subscriptionPlanId,
    cycle: 'MONTHLY',
    transactionReference: `LOCAL-${suffix}`,
    senderName: 'Tenant A Sender',
    amount: '1200.00',
    method: 'BANK TRANSFER',
    paymentDate: new Date().toISOString().slice(0, 10),
  };
  const submit = () => fetch(`${baseUrl}/api/v1/subscriptions/payments`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  const submitted = await submit();
  assert.equal(submitted.status, 201);
  const submittedBody = await submitted.json() as { data: { id: string; status: string } };
  subscriptionPaymentId = submittedBody.data.id;
  assert.equal(submittedBody.data.status, 'PENDING');
  assert.equal(await prisma.subscription.count({ where: { businessId: businessAId } }), before);
  assert.equal((await submit()).status, 409);
  const forbiddenQueue = await fetch(`${baseUrl}/api/v1/platform/billing/payments`, { headers: { authorization: authHeader } });
  assert.equal(forbiddenQueue.status, 403);

  const reviewPermission = await prisma.permission.upsert({
    where: { key: 'platform:payments:review' },
    update: {},
    create: { key: 'platform:payments:review', description: 'Review subscription payments in integration test' },
  });
  await prisma.platformPermissionGrant.createMany({
    data: [
      { userId: platformStaffId, permissionId: reviewPermission.id },
      { userId: platformSuperAdminId, permissionId: reviewPermission.id },
    ],
  });
  const platformToken = process.env.TENANT_TEST_PLATFORM_TOKEN;
  const superAdminToken = process.env.TENANT_TEST_SUPER_ADMIN_TOKEN;
  if (!platformToken || !superAdminToken) throw new Error('Platform test tokens were not initialized');
  const staffReview = await fetch(`${baseUrl}/api/v1/platform/billing/payments/${subscriptionPaymentId}/review`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${platformToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'APPROVE' }),
  });
  assert.equal(staffReview.status, 403);
  const rejectForeign = (body: unknown) => fetch(`${baseUrl}/api/v1/platform/billing/payments/${foreignPayment.id}/review`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal((await rejectForeign({ decision: 'REJECT' })).status, 400);
  const rejected = await rejectForeign({ decision: 'REJECT', reason: 'Reference could not be reconciled' });
  assert.equal(rejected.status, 200);
  const rejectionBody = await rejected.json() as { data: { payment: { status: string; rejectionReason: string } } };
  assert.equal(rejectionBody.data.payment.status, 'REJECTED');
  assert.equal(rejectionBody.data.payment.rejectionReason, 'Reference could not be reconciled');
  const review = () => fetch(`${baseUrl}/api/v1/platform/billing/payments/${subscriptionPaymentId}/review`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'APPROVE' }),
  });
  const approved = await review();
  assert.equal(approved.status, 200);
  const approvedBody = await approved.json() as { data: { payment: { status: string; invoiceNumber: string | null }; subscription: { status: string } } };
  assert.equal(approvedBody.data.payment.status, 'APPROVED');
  assert.ok(approvedBody.data.payment.invoiceNumber);
  assert.equal(approvedBody.data.subscription.status, 'ACTIVE');
  assert.equal((await review()).status, 409);

  const foreignDetail = await fetch(`${baseUrl}/api/v1/platform/billing/businesses/${businessBId}`, { headers: { authorization: authHeader } });
  assert.equal(foreignDetail.status, 403);
  const ownReceipt = await fetch(`${baseUrl}/api/v1/subscriptions/payments/${subscriptionPaymentId}/receipt.pdf`, { headers: { authorization: authHeader } });
  assert.equal(ownReceipt.status, 200);
  assert.equal(ownReceipt.headers.get('content-type'), 'application/pdf');
  const foreignReceipt = await fetch(`${baseUrl}/api/v1/subscriptions/payments/${foreignPayment.id}/receipt.pdf`, { headers: { authorization: authHeader } });
  assert.equal(foreignReceipt.status, 404);
});

test('offline order retries and duplicate payment requests create one notification per committed event', { skip: !enabled }, async () => {
  const operationId = randomUUID();
  offlineOrderId = randomUUID();
  const promisedAt = new Date(Date.now() + 86_400_000).toISOString();
  const request = {
    operations: [{
      clientOperationId: operationId,
      entityType: 'order',
      entityId: offlineOrderId,
      payload: {
        action: 'order.create',
        order: {
          customerId: customerAId,
          promisedAt,
          items: [{ garmentName: 'Shalwar Kameez', quantity: 1, unitPrice: '1000.00' }],
        },
      },
    }],
  };
  const sync = () => fetch(`${baseUrl}/api/v1/sync/operations`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const firstSync = await sync();
  assert.equal(firstSync.status, 200);
  const replaySync = await sync();
  assert.equal(replaySync.status, 200);
  const replay = await replaySync.json() as { data: { results: Array<{ duplicate?: boolean }> } };
  assert.equal(replay.data.results[0]?.duplicate, true);
  assert.equal(await prisma.whatsAppNotification.count({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'ORDER_CREATED' },
  }), 1);

  const paymentKey = randomUUID();
  const postPayment = () => fetch(`${baseUrl}/api/v1/payments/orders/${offlineOrderId}`, {
    method: 'POST',
    headers: {
      authorization: authHeader,
      'content-type': 'application/json',
      'Idempotency-Key': paymentKey,
    },
    body: JSON.stringify({ amount: '250.00', method: 'CASH' }),
  });
  const paymentResponse = await postPayment();
  assert.equal(paymentResponse.status, 201);
  const paymentBody = await paymentResponse.json() as { data: { id: string } };
  const duplicatePaymentResponse = await postPayment();
  assert.equal(duplicatePaymentResponse.status, 200);
  const duplicateBody = await duplicatePaymentResponse.json() as { replayed: boolean };
  assert.equal(duplicateBody.replayed, true);
  assert.equal(await prisma.payment.count({ where: { businessId: businessAId, orderId: offlineOrderId } }), 1);
  assert.equal(await prisma.whatsAppNotification.count({
    where: { businessId: businessAId, paymentId: paymentBody.data.id, kind: 'PAYMENT_RECEIVED' },
  }), 1);

  const workflow = ['MEASUREMENT_CONFIRMED', 'CUTTING', 'STITCHING', 'FINISHING', 'READY_FOR_PICKUP'];
  let orderVersion = (await prisma.order.findFirstOrThrow({
    where: { id: offlineOrderId, businessId: businessAId },
    select: { version: true },
  })).version;
  for (const toStatus of workflow) {
    const transition = await fetch(`${baseUrl}/api/v1/orders/${offlineOrderId}/status`, {
      method: 'POST',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({ toStatus, version: orderVersion }),
    });
    assert.equal(transition.status, 200);
    const transitionBody = await transition.json() as { data: { version: number } };
    orderVersion = transitionBody.data.version;
  }
  assert.equal(await prisma.whatsAppNotification.count({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'ORDER_READY' },
  }), 1);

  const foreignNotification = await prisma.whatsAppNotification.create({
    data: {
      businessId: businessBId,
      customerId: customerBId,
      orderId: orderBId,
      kind: 'ORDER_CREATED',
      status: 'NOT_SENT',
      idempotencyKey: `tenant-test:${randomUUID()}`,
      recipientPhone: '+923007654321',
      templateName: 'test_template',
      payload: {},
    },
  });
  const scopedHistory = await fetch(`${baseUrl}/api/v1/notifications?orderId=${orderBId}`, {
    headers: { authorization: authHeader },
  });
  assert.equal(scopedHistory.status, 200);
  const history = await scopedHistory.json() as { data: { items: Array<{ id: string }> } };
  assert.equal(history.data.items.some((item) => item.id === foreignNotification.id), false);
});

test('expired subscriptions preserve business reads and billing while blocking tenant writes', { skip: !enabled }, async () => {
  const active = await prisma.subscription.findFirstOrThrow({
    where: { businessId: businessAId, status: 'ACTIVE', grandfathered: false },
    orderBy: { createdAt: 'desc' },
  });
  const expiredAt = new Date(Date.now() - 10 * 86_400_000);
  await prisma.subscription.update({
    where: { id: active.id },
    data: { status: 'EXPIRED', endsAt: expiredAt, graceUntil: expiredAt },
  });
  const customers = await fetch(`${baseUrl}/api/v1/customers`, { headers: { authorization: authHeader } });
  assert.equal(customers.status, 200);
  const blockedWrite = await fetch(`${baseUrl}/api/v1/customers`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Must remain blocked', phone: '03001230099' }),
  });
  assert.equal(blockedWrite.status, 402);
  const billing = await fetch(`${baseUrl}/api/v1/subscriptions`, { headers: { authorization: authHeader } });
  assert.equal(billing.status, 200);
});

test('Meta send failures persist as Failed and verified webhooks alone confirm delivery', { skip: !enabled }, async () => {
  const { processNextWhatsAppNotification } = await import('../src/whatsapp.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('provider response must not be stored', { status: 400 });
  try {
    assert.equal(await processNextWhatsAppNotification(), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const failed = await prisma.whatsAppNotification.findFirstOrThrow({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'ORDER_CREATED', status: 'FAILED' },
  });
  assert.match(failed.lastError ?? '', /HTTP 400/);
  assert.equal(failed.lastError?.includes('provider response'), false);

  const webhookBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: 'test-only-phone-id' },
          statuses: [{
            id: 'wamid.test-only-message-id',
            status: 'delivered',
            timestamp: String(Math.floor(Date.now() / 1000)),
            biz_opaque_callback_data: failed.id,
          }],
        },
      }],
    }],
  });
  const signature = `sha256=${createHmac('sha256', 'test-only-meta-app-secret').update(webhookBody).digest('hex')}`;
  const forged = await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` },
    body: webhookBody,
  });
  assert.equal(forged.status, 401);
  const verified = await fetch(`${baseUrl}/api/v1/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: webhookBody,
  });
  assert.equal(verified.status, 200);
  const delivered = await prisma.whatsAppNotification.findUniqueOrThrow({ where: { id: failed.id } });
  assert.equal(delivered.status, 'DELIVERED');
  assert.equal(delivered.lastError, null);
});
