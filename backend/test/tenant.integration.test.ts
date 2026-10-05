import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
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
let authHeader = '';
let authHeaderB = '';
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
  const suffix = randomUUID();
  const tailorTemplate = await prisma.businessTemplate.findUniqueOrThrow({
    where: { key: 'tailor' },
    select: { id: true },
  });
  const [businessA, businessB] = await Promise.all([
    prisma.business.create({ data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}`.slice(0, 80), status: 'ACTIVE', templateId: tailorTemplate.id } }),
    prisma.business.create({ data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}`.slice(0, 80), status: 'ACTIVE', templateId: tailorTemplate.id } }),
  ]);
  businessAId = businessA.id;
  businessBId = businessB.id;
  await prisma.businessConfiguration.create({
    data: {
      businessId: businessA.id,
      enabledModules: ['customers', 'measurements', 'orders', 'payments', 'reports', 'notifications', 'catalog'],
      contactPhone: '+923001234567',
      notificationTemplates: {
        ORDER_CREATED: {
          enabled: true,
          body: '{{customer.name}}: {{item.name}} for {{order.total}}',
          providerTemplateName: 'tenant_order_created',
          language: 'en',
        },
        STATUS_CHANGED: {
          enabled: true,
          body: '{{order.number}} is now {{order.status}}',
          providerTemplateName: 'tenant_status_changed',
          language: 'en',
        },
        PAYMENT_DUE: {
          enabled: true,
          body: 'Balance for {{order.number}} is {{order.balance}}',
          providerTemplateName: 'tenant_payment_due',
          language: 'en',
        },
        SUBSCRIPTION_EXPIRING: {
          enabled: true,
          body: '{{recipient.name}}: {{subscription.plan}} ends {{subscription.endsAt}} in {{subscription.daysRemaining}} days',
          providerTemplateName: 'tenant_subscription_expiring',
          language: 'en',
        },
      },
    },
  });
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
      where: { key: 'settings:manage' },
      update: {},
      create: { key: 'settings:manage', description: 'Manage business configuration in tenant isolation test' },
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
  const [membershipA, membershipB] = await Promise.all([
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
  authHeaderB = `Bearer ${jwt.sign(
    { scope: 'business', membershipId: membershipB.id },
    secret,
    { subject: userB.id, issuer: 'tailor-api', audience: 'tailor-clients', expiresIn: '5m', algorithm: 'HS256' },
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
  await prisma.orderWorkflowHistory.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.orderStatusHistory.deleteMany({ where: { order: { businessId: { in: [businessAId, businessBId] } } } });
  await prisma.alterationTask.deleteMany({ where: { order: { businessId: { in: [businessAId, businessBId] } } } });
  await prisma.orderItem.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.order.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.auditEvent.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.syncOperation.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.membership.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
  await prisma.rolePermissionGrant.deleteMany({ where: { roleId: { in: [roleAId, roleBId] } } });
  await prisma.role.deleteMany({ where: { id: { in: [roleAId, roleBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  if (assignedOwnerId) await prisma.user.delete({ where: { id: assignedOwnerId } });
  await prisma.user.delete({ where: { id: platformStaffId } });
  await prisma.user.delete({ where: { id: platformSuperAdminId } });
  await prisma.businessItem.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
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

  await prisma.customFieldDefinition.create({
    data: {
      businessId: businessAId,
      module: 'customers',
      screen: 'customer',
      key: 'preferred_contact',
      label: 'Preferred contact',
      type: 'DROPDOWN',
      required: true,
      options: ['phone', 'whatsapp'],
      sortOrder: 0,
    },
  });
  const invalidDynamicField = await fetch(`${baseUrl}/api/v1/customers`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Invalid custom field', phone: '03001230002', customFields: { preferred_contact: 'email' } }),
  });
  assert.equal(invalidDynamicField.status, 400);
  const missingDynamicField = await fetch(`${baseUrl}/api/v1/customers`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Missing custom field', phone: '03001230003' }),
  });
  assert.equal(missingDynamicField.status, 400);

  const forgedCreate = await fetch(`${baseUrl}/api/v1/customers`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      businessId: businessBId,
      name: 'Created inside tenant A',
      phone: '03001230001',
      customFields: { preferred_contact: 'phone' },
    }),
  });
  assert.equal(forgedCreate.status, 201);
  const created = await forgedCreate.json() as { data: { businessId: string; customFields: Record<string, unknown> } };
  assert.equal(created.data.businessId, businessAId);
  assert.equal(created.data.customFields.preferred_contact, 'phone');

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
  assert.ok([400, 404].includes(crossTenantOrder.status));
});

test('business field and workflow editing is versioned and restricted to the authenticated tenant', { skip: !enabled }, async () => {
  const configurationResponse = await fetch(`${baseUrl}/api/v1/business/configuration`, {
    headers: { authorization: authHeader },
  });
  assert.equal(configurationResponse.status, 200);
  const configuration = (await configurationResponse.json() as {
    data: {
      configurationVersion: number;
      templateVersion: number;
      workflow: {
        stages: Array<{ id: string; key: string; label: string; sortOrder: number; isInitial: boolean; isTerminal: boolean; actions: string[] }>;
        transitions: Array<{ fromStageId: string; toStageId: string; allowedRoleKeys: string[]; actions: string[] }>;
      };
    };
  }).data;
  const stageKeys = new Map(configuration.workflow.stages.map((stage) => [stage.id, stage.key]));
  const input = {
    version: configuration.configurationVersion,
    templateVersion: configuration.templateVersion,
    fields: [{
      module: 'customers',
      screen: 'customer',
      key: 'tenant_business_note',
      label: 'Tenant business note',
      type: 'TEXT',
      required: false,
      sortOrder: 0,
    }],
    stages: configuration.workflow.stages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      sortOrder: stage.sortOrder,
      isInitial: stage.isInitial,
      isTerminal: stage.isTerminal,
      actions: stage.actions,
    })),
    transitions: configuration.workflow.transitions.map((transition) => ({
      from: stageKeys.get(transition.fromStageId)!,
      to: stageKeys.get(transition.toStageId)!,
      allowedRoleKeys: transition.allowedRoleKeys,
      actions: transition.actions,
    })),
  };
  const savedResponse = await fetch(`${baseUrl}/api/v1/business/configuration/structure`, {
    method: 'PUT',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json() as { data: { version: number; templateVersion: number } }).data;
  assert.equal(saved.version, input.version + 1);
  assert.equal(saved.templateVersion, input.templateVersion);
  assert.equal(await prisma.customFieldDefinition.count({
    where: { businessId: businessAId, key: 'tenant_business_note', active: true },
  }), 1);
  assert.equal(await prisma.customFieldDefinition.count({
    where: { businessId: businessBId, key: 'tenant_business_note' },
  }), 0);
  assert.equal(await prisma.auditEvent.count({
    where: { businessId: businessAId, action: 'business.structure_published', entityId: businessAId },
  }), 1);

  const staleResponse = await fetch(`${baseUrl}/api/v1/business/configuration/structure`, {
    method: 'PUT',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(staleResponse.status, 409);
  const latestConfiguration = (await (await fetch(`${baseUrl}/api/v1/business/configuration`, {
    headers: { authorization: authHeader },
  })).json() as { data: { configurationVersion: number } }).data;
  const staleTemplateResponse = await fetch(`${baseUrl}/api/v1/business/configuration/structure`, {
    method: 'PUT',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...input,
      version: latestConfiguration.configurationVersion,
      templateVersion: input.templateVersion + 1,
    }),
  });
  assert.equal(staleTemplateResponse.status, 409);

  const crossTenantResponse = await fetch(`${baseUrl}/api/v1/business/configuration/structure`, {
    method: 'PUT',
    headers: { authorization: authHeaderB, 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, businessId: businessAId }),
  });
  assert.equal(crossTenantResponse.status, 400);
  const platformResponse = await fetch(`${baseUrl}/api/v1/business/configuration/structure`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${process.env.TENANT_TEST_PLATFORM_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  assert.equal(platformResponse.status, 403);
  assert.equal(await prisma.customFieldDefinition.count({
    where: { businessId: businessBId, key: 'tenant_business_note' },
  }), 0);
});

test('generic catalog validates configured fields and stays tenant-scoped', { skip: !enabled }, async () => {
  await prisma.customFieldDefinition.create({
    data: {
      businessId: businessAId,
      module: 'catalog',
      screen: 'item',
      key: 'material',
      label: 'Material',
      type: 'DROPDOWN',
      required: true,
      options: ['oak', 'walnut'],
      sortOrder: 0,
    },
  });
  const create = (name: string, material?: string) => fetch(`${baseUrl}/api/v1/catalog`, {
    method: 'POST',
    headers: { authorization: authHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      typeKey: 'garment',
      name,
      unit: 'piece',
      unitPrice: '125.50',
      sortOrder: 0,
      customFields: material === undefined ? {} : { material },
    }),
  });
  assert.equal((await create('Missing material')).status, 400);
  assert.equal((await create('Invalid material', 'cedar')).status, 400);
  const created = await create('Walnut sample', 'walnut');
  assert.equal(created.status, 201);
  const response = await created.json() as { data: { id: string; customFields: Record<string, unknown>; unitPrice: string } };
  assert.equal(response.data.customFields.material, 'walnut');
  assert.equal(response.data.unitPrice, '125.5');

  const tenantB = await fetch(`${baseUrl}/api/v1/catalog`, {
    headers: { authorization: authHeaderB },
  });
  assert.equal(tenantB.status, 200);
  const foreignList = await tenantB.json() as { data: { items: Array<{ id: string }> } };
  assert.equal(foreignList.data.items.some((item) => item.id === response.data.id), false);
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
  assert.ok((membership?.role.grants.length ?? 0) >= 14);
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
  const configuredNotification = await prisma.whatsAppNotification.findFirstOrThrow({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'ORDER_CREATED' },
  });
  assert.equal(configuredNotification.templateName, 'tenant_order_created');
  assert.deepEqual((configuredNotification.payload as { templateParameters: string[] }).templateParameters, [
    'Tenant A User',
    'Shalwar Kameez',
    'PKR 1000.00',
  ]);
  const orderListResponse = await fetch(`${baseUrl}/api/v1/orders`, { headers: { authorization: authHeader } });
  assert.equal(orderListResponse.status, 200);
  const orderList = await orderListResponse.json() as {
    data: { items: Array<{ id: string; items: Array<{ customFields?: Record<string, unknown> }> }> };
  };
  const syncedOrder = orderList.data.items.find((item) => item.id === offlineOrderId);
  assert.equal(syncedOrder?.items[0]?.customFields?.garment_name, 'Shalwar Kameez');
  assert.equal(syncedOrder?.items[0]?.customFields?.quantity, '1');

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
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'STATUS_CHANGED' },
  }), workflow.length);
  assert.equal(await prisma.whatsAppNotification.count({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'ORDER_READY' },
  }), 1);
  await prisma.order.updateMany({
    where: { id: offlineOrderId, businessId: businessAId },
    data: { promisedAt: new Date(Date.now() - 86_400_000) },
  });
  const { enqueueDuePaymentNotifications } = await import('../src/whatsapp.js');
  await enqueueDuePaymentNotifications();
  await enqueueDuePaymentNotifications();
  assert.equal(await prisma.whatsAppNotification.count({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'PAYMENT_DUE' },
  }), 1);
  const dueNotification = await prisma.whatsAppNotification.findFirstOrThrow({
    where: { businessId: businessAId, orderId: offlineOrderId, kind: 'PAYMENT_DUE' },
  });
  const dueOrder = await prisma.order.findFirstOrThrow({
    where: { id: offlineOrderId, businessId: businessAId },
    select: { orderNumber: true },
  });
  assert.equal(dueNotification.templateName, 'tenant_payment_due');
  assert.deepEqual((dueNotification.payload as { templateParameters: string[] }).templateParameters, [dueOrder.orderNumber, 'PKR 750.00']);

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

test('subscription expiry reminders use configured business contact, idempotency and generic history fields', { skip: !enabled }, async () => {
  const existingBillingSetting = await prisma.platformSetting.findUnique({ where: { key: 'billing' } });
  await prisma.platformSetting.upsert({
    where: { key: 'billing' },
    create: { key: 'billing', value: { expiryReminderDays: [14] } },
    update: { value: { expiryReminderDays: [14] } },
  });
  const now = new Date();
  const endsAt = new Date(now.getTime() + 14 * 86_400_000);
  const subscription = await prisma.subscription.create({
    data: {
      businessId: businessAId,
      planId: subscriptionPlanId,
      status: 'ACTIVE',
      cycle: 'YEARLY',
      startsAt: new Date(now.getTime() - 86_400_000),
      endsAt,
      graceUntil: new Date(endsAt.getTime() + 7 * 86_400_000),
    },
  });
  try {
    const configurationResponse = await fetch(`${baseUrl}/api/v1/business/configuration`, {
      headers: { authorization: authHeader },
    });
    assert.equal(configurationResponse.status, 200);
    const configurationBody = await configurationResponse.json() as {
      data: { version: number; contactPhone: string | null; notificationTemplates: Record<string, unknown> };
    };
    assert.equal(configurationBody.data.contactPhone, '+923001234567');
    const template = {
      enabled: true,
      body: '{{recipient.name}}: {{subscription.plan}} ends {{subscription.endsAt}} in {{subscription.daysRemaining}} days',
      providerTemplateName: 'tenant_subscription_expiring',
      language: 'en',
    };
    const invalidTemplateResponse = await fetch(`${baseUrl}/api/v1/business/configuration`, {
      method: 'PUT',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        version: configurationBody.data.version,
        notificationTemplates: { SUBSCRIPTION_EXPIRING: { ...template, body: 'Ends {{subscription.unknown}}' } },
        publish: false,
      }),
    });
    assert.equal(invalidTemplateResponse.status, 400);
    const templateResponse = await fetch(`${baseUrl}/api/v1/business/configuration`, {
      method: 'PUT',
      headers: { authorization: authHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        version: configurationBody.data.version,
        contactPhone: '+923001234567',
        notificationTemplates: { SUBSCRIPTION_EXPIRING: template },
        publish: false,
      }),
    });
    assert.equal(templateResponse.status, 200);

    const { enqueueSubscriptionExpiryNotifications, processNextWhatsAppNotification } = await import('../src/whatsapp.js');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await enqueueSubscriptionExpiryNotifications();
      if (await prisma.whatsAppNotification.count({
        where: { businessId: businessAId, kind: 'SUBSCRIPTION_EXPIRING' },
      })) break;
    }
    const notification = await prisma.whatsAppNotification.findFirstOrThrow({
      where: {
        businessId: businessAId,
        kind: 'SUBSCRIPTION_EXPIRING',
        idempotencyKey: {
          startsWith: `subscription-expiring:${subscription.id}:`,
        },
      },
    });
    assert.equal(notification.customerId, null);
    assert.equal(notification.orderId, null);
    assert.match(notification.recipientName ?? '', /^Tenant A /);
    assert.equal(notification.recipientPhone, '+923001234567');
    assert.equal(notification.templateName, 'tenant_subscription_expiring');
    assert.equal(await prisma.whatsAppNotification.count({
      where: { idempotencyKey: notification.idempotencyKey },
    }), 1);
    assert.deepEqual(
      (notification.payload as { templateParameters: string[] }).templateParameters.slice(0, 1),
      [notification.recipientName],
    );
    assert.equal((notification.payload as { templateParameters: string[] }).templateParameters.at(-1), '14');

    const historyResponse = await fetch(`${baseUrl}/api/v1/notifications?limit=100`, {
      headers: { authorization: authHeader },
    });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json() as {
      data: { items: Array<{ id: string; customerId: string | null; orderId: string | null; recipientName: string | null }> };
    };
    const historyItem = history.data.items.find((item) => item.id === notification.id);
    assert.deepEqual(historyItem && {
      customerId: historyItem.customerId,
      orderId: historyItem.orderId,
      recipientName: historyItem.recipientName,
    }, { customerId: null, orderId: null, recipientName: notification.recipientName });

    await prisma.whatsAppNotification.update({
      where: { id: notification.id },
      data: { createdAt: new Date(0) },
    });
    const originalFetch = globalThis.fetch;
    let sentRequest = '';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      sentRequest = typeof input === 'string' ? input : input.toString();
      assert.match(sentRequest, /\/messages$/);
      const body = JSON.parse(String(init?.body)) as { to: string; template: { name: string } };
      assert.equal(body.to, '923001234567');
      assert.equal(body.template.name, 'tenant_subscription_expiring');
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.subscription-test' }] }), { status: 200 });
    }) as typeof fetch;
    try {
      assert.equal(await processNextWhatsAppNotification(), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.match(sentRequest, /\/messages$/);
    assert.equal((await prisma.whatsAppNotification.findUniqueOrThrow({ where: { id: notification.id } })).status, 'SENT');
  } finally {
    await prisma.subscription.delete({ where: { id: subscription.id } });
    if (existingBillingSetting) {
      await prisma.platformSetting.update({
        where: { key: 'billing' },
        data: { value: existingBillingSetting.value },
      });
    } else {
      await prisma.platformSetting.deleteMany({ where: { key: 'billing' } });
    }
  }
});

test('expired subscriptions preserve business reads and billing while blocking tenant writes', { skip: !enabled }, async () => {
  const previousBillingSetting = await prisma.platformSetting.findUnique({ where: { key: 'billing' } });
  await prisma.platformSetting.upsert({
    where: { key: 'billing' },
    create: { key: 'billing', value: { enforcementEnabled: true } },
    update: { value: { enforcementEnabled: true } },
  });
  try {
    const expiredAt = new Date(Date.now() - 10 * 86_400_000);
    await prisma.subscription.updateMany({
      where: { businessId: businessAId, status: { in: ['ACTIVE', 'TRIAL', 'EXPIRED'] }, grandfathered: false },
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
  } finally {
    if (previousBillingSetting) {
      await prisma.platformSetting.update({
        where: { key: 'billing' },
        data: { value: JSON.parse(JSON.stringify(previousBillingSetting.value)) as Prisma.InputJsonValue },
      });
    } else {
      await prisma.platformSetting.deleteMany({ where: { key: 'billing' } });
    }
  }
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
