import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
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
const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];
let subscriptionPlanId = '';
let baseUrl = '';
let closeServer: (() => Promise<void>) | undefined;

type ApiField = {
  key: string;
  label: string;
  type: string;
  module: string;
  screen: string;
  options: unknown;
};

type ConfigurationResponse = {
  version: number;
  template: { key: string };
  availableModules: string[];
  availablePaymentMethods: string[];
  availableDashboardWidgets: string[];
  enabledModules: string[];
  paymentMethods: string[];
  dashboardWidgets: string[];
  terminology: Record<string, string>;
  itemTypes: Array<{ key: string; label: string }>;
  fields: ApiField[];
  workflow: {
    stages: Array<{ id: string; key: string; label: string; isInitial: boolean }>;
    transitions: Array<{ fromStageId: string; toStageId: string }>;
  };
};

function tokenFor(userId: string, membershipId: string): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is required for template acceptance tests');
  return jwt.sign(
    { scope: 'business', membershipId },
    secret,
    {
      subject: userId,
      issuer: 'tailor-api',
      audience: 'tailor-clients',
      expiresIn: '5m',
      algorithm: 'HS256',
    },
  );
}

function fieldValue(field: ApiField): unknown {
  switch (field.type) {
    case 'NUMBER':
    case 'CURRENCY':
    case 'MEASUREMENT':
      return field.key.includes('quantity') ? 500 : 180;
    case 'DROPDOWN':
    case 'MULTI_SELECT': {
      const firstOption = Array.isArray(field.options) ? field.options[0] : undefined;
      const option = typeof firstOption === 'string'
        ? firstOption
        : firstOption && typeof firstOption === 'object' && !Array.isArray(firstOption) && 'key' in firstOption
          ? firstOption.key
          : undefined;
      assert.equal(typeof option, 'string', `Expected configured options for ${field.key}`);
      return field.type === 'MULTI_SELECT' ? [option] : option;
    }
    case 'BOOLEAN':
      return true;
    case 'DATE':
      return '2026-10-05';
    case 'DATETIME':
      return '2026-10-05T12:00:00.000Z';
    default:
      return `${field.label} acceptance sample`;
  }
}

function customFieldInput(fields: ApiField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, fieldValue(field)]));
}

function fieldsFor(
  fields: ApiField[],
  module: string,
  screens: string[],
): ApiField[] {
  return fields.filter((field) => field.module === module && screens.includes(field.screen));
}

async function responseData<T>(response: Response): Promise<T> {
  return (await response.json() as { data: T }).data;
}

async function apiRequest(
  path: string,
  authorization?: string,
  method = 'GET',
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

before(async () => {
  if (!enabled) return;
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
  process.env.CORS_ORIGINS ??= 'http://localhost:5173';
  process.env.LOG_LEVEL = 'silent';
  process.env.WHATSAPP_ENABLED = 'false';

  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Business template acceptance server did not bind');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

after(async () => {
  await closeServer?.();
  if (createdBusinessIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionEvent.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.subscriptionPayment.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.subscription.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.whatsAppNotification.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.customFieldValue.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.syncOperation.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.orderWorkflowHistory.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.orderStatusHistory.deleteMany({ where: { order: { businessId: { in: createdBusinessIds } } } });
      await tx.orderItem.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.order.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.auditEvent.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.businessItem.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.customer.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await tx.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (subscriptionPlanId) {
    await prisma.subscriptionPlan.deleteMany({ where: { id: subscriptionPlanId } });
  }
  await prisma.$disconnect();
});

test('all five business templates work through scoped configuration, catalog, order, and workflow APIs', {
  skip: !enabled,
}, async () => {
  const suffix = randomUUID();
  const expectedKeys = ['tailor', 'furniture', 'carpenter', 'auto-workshop', 'printing'];
  const templates = await prisma.businessTemplate.findMany({
    where: { key: { in: expectedKeys }, active: true },
    include: {
      fields: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      workflowStages: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      workflowTransitions: true,
    },
  });
  templates.sort((left, right) => expectedKeys.indexOf(left.key) - expectedKeys.indexOf(right.key));
  assert.deepEqual(templates.map(({ key }) => key).sort(), [...expectedKeys].sort());
  const itemTypesColumn = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'BusinessConfiguration'
      AND column_name = 'itemTypes'
  `;
  assert.equal(itemTypesColumn[0]?.is_nullable, 'YES', 'BusinessConfiguration.itemTypes must be nullable');

  const permissionDescriptions = [
    ['customers:write', 'Create customers in template acceptance tests'],
    ['orders:read', 'Read catalog items in template acceptance tests'],
    ['orders:write', 'Create orders in template acceptance tests'],
    ['orders:transition', 'Advance orders in template acceptance tests'],
    ['settings:manage', 'Manage business configuration and catalog in template acceptance tests'],
    ['staff:manage', 'Manage business roles and staff in template acceptance tests'],
  ] as const;
  const permissions = await Promise.all(permissionDescriptions.map(([key, description]) =>
    prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description },
    })));
  const permissionIds = permissions.map(({ id }) => id);
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: `Template acceptance ${suffix.slice(0, 8)}`,
      monthlyPrice: '0.00',
      yearlyPrice: '0.00',
      features: { catalog: true, customers: true, orders: true },
      limits: { catalogItems: -1, customers: -1, ordersPerMonth: -1, staff: -1 },
    },
  });
  subscriptionPlanId = plan.id;

  let firstOrderId: string | undefined;
  for (const [index, template] of templates.entries()) {
    assert.ok(template.fields.length > 0, `${template.key} has custom fields`);
    assert.ok(template.workflowStages.length >= 2, `${template.key} has workflow stages`);
    assert.ok(template.workflowTransitions.length > 0, `${template.key} has workflow transitions`);
    assert.ok(template.enabledModules.includes('catalog'), `${template.key} enables catalog`);
    assert.ok(template.enabledModules.includes('orders'), `${template.key} enables orders`);

    const itemTypes = template.itemTypes as Array<{ key: string; label: string }>;
    assert.ok(itemTypes.length > 0, `${template.key} has item types`);
    const business = await prisma.business.create({
      data: {
        name: `${template.name} API acceptance ${suffix.slice(0, 8)}`,
        slug: `${template.key}-api-${suffix}`.slice(0, 80),
        businessType: template.key.toUpperCase(),
        templateId: template.id,
        status: 'ACTIVE',
      },
    });
    createdBusinessIds.push(business.id);

    const owner = await prisma.user.create({
      data: {
        email: `${template.key}-owner-${suffix}@example.test`,
        name: `${template.name} API Acceptance Owner`,
        passwordHash: 'acceptance-test-only-not-a-login',
      },
    });
    createdUserIds.push(owner.id);
    const ownerRole = await prisma.role.create({
      data: { businessId: business.id, name: 'Owner', isSystem: true },
    });
    await prisma.rolePermissionGrant.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: ownerRole.id, permissionId })),
    });
    const ownerMembership = await prisma.membership.create({
      data: { businessId: business.id, userId: owner.id, roleId: ownerRole.id },
    });
    const ownerToken = tokenFor(owner.id, ownerMembership.id);

    let readOnlyToken: string | undefined;
    if (index === 0) {
      const readOnlyUser = await prisma.user.create({
        data: {
          email: `template-reader-${suffix}@example.test`,
          name: 'Template Acceptance Read-only User',
          passwordHash: 'acceptance-test-only-not-a-login',
        },
      });
      createdUserIds.push(readOnlyUser.id);
      const readOnlyRole = await prisma.role.create({
        data: { businessId: business.id, name: 'Read-only', isSystem: false },
      });
      const readOnlyMembership = await prisma.membership.create({
        data: { businessId: business.id, userId: readOnlyUser.id, roleId: readOnlyRole.id },
      });
      readOnlyToken = tokenFor(readOnlyUser.id, readOnlyMembership.id);
    }

    const enabledModules = [...new Set([...template.enabledModules, 'catalog'])];
    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 86_400_000);
    await prisma.$transaction(async (tx) => {
      await tx.businessConfiguration.create({
        data: {
          businessId: business.id,
          enabledModules,
          paymentMethods: template.paymentMethods,
          dashboardWidgets: template.dashboardWidgets,
          publishedAt: now,
        },
      });
      await tx.$executeRaw`
        UPDATE "BusinessConfiguration"
        SET "itemTypes" = NULL
        WHERE "businessId" = ${business.id}::uuid
      `;
      await tx.subscription.create({
        data: {
          businessId: business.id,
          planId: plan.id,
          status: 'ACTIVE',
          cycle: 'MONTHLY',
          startsAt: new Date(now.getTime() - 86_400_000),
          endsAt,
          graceUntil: new Date(endsAt.getTime() + 7 * 86_400_000),
        },
      });
    }, { maxWait: 20_000, timeout: 30_000 });

    const anonymousConfiguration = await apiRequest('/api/v1/business/configuration');
    assert.equal(anonymousConfiguration.status, 401, 'configuration requires an authenticated user');
    const configurationResponse = await apiRequest('/api/v1/business/configuration', ownerToken);
    assert.equal(configurationResponse.status, 200);
    const configuration = await responseData<ConfigurationResponse>(configurationResponse);
    assert.equal(configuration.template.key, template.key);
    assert.deepEqual(configuration.itemTypes, itemTypes, 'nullable tenant item types fall back to template defaults');
    assert.deepEqual(configuration.availableModules, template.enabledModules);
    assert.deepEqual(configuration.availablePaymentMethods, template.paymentMethods);
    assert.deepEqual(configuration.availableDashboardWidgets, template.dashboardWidgets);
    assert.deepEqual(configuration.paymentMethods, template.paymentMethods);
    assert.deepEqual(configuration.dashboardWidgets, template.dashboardWidgets);
    assert.ok(configuration.enabledModules.includes('catalog'));
    assert.deepEqual(configuration.workflow.stages.map(({ key }) => key), template.workflowStages.map(({ key }) => key));

    if (readOnlyToken) {
      const deniedConfigurationWrite = await apiRequest(
        '/api/v1/business/configuration',
        readOnlyToken,
        'PUT',
        { version: configuration.version, publish: true },
      );
      assert.equal(deniedConfigurationWrite.status, 403, 'a role without settings:manage cannot edit configuration');
    }
    const savedConfigurationResponse = await apiRequest('/api/v1/business/configuration', ownerToken, 'PUT', {
      version: configuration.version,
      enabledModules: configuration.enabledModules,
      paymentMethods: configuration.paymentMethods,
      dashboardWidgets: configuration.dashboardWidgets.slice(0, 1),
      terminologyOverrides: { item: `Configured ${itemTypes[0]!.label}` },
      itemTypes: itemTypes.map((itemType, typeIndex) => typeIndex === 0
        ? { ...itemType, label: `Configured ${itemType.label}` }
        : itemType),
      publish: true,
    });
    assert.equal(
      savedConfigurationResponse.status,
      200,
      `the Owner role can publish business configuration: ${await savedConfigurationResponse.text()}`,
    );
    const effectiveConfigurationResponse = await apiRequest('/api/v1/business/configuration', ownerToken);
    assert.equal(effectiveConfigurationResponse.status, 200);
    const effectiveConfiguration = await responseData<ConfigurationResponse>(effectiveConfigurationResponse);
    const configuredItemTypes = itemTypes.map((itemType, typeIndex) => typeIndex === 0
      ? { ...itemType, label: `Configured ${itemType.label}` }
      : itemType);
    assert.deepEqual(effectiveConfiguration.itemTypes, configuredItemTypes);
    assert.deepEqual(effectiveConfiguration.enabledModules, enabledModules);
    assert.deepEqual(effectiveConfiguration.paymentMethods, template.paymentMethods);
    assert.deepEqual(effectiveConfiguration.dashboardWidgets, template.dashboardWidgets.slice(0, 1));
    assert.equal(effectiveConfiguration.terminology.item, `Configured ${itemTypes[0]!.label}`);

    if (index === 0) {
      const teamRoleResponse = await apiRequest('/api/v1/business/roles', ownerToken, 'POST', {
        name: `Sync Manager ${suffix.slice(0, 8)}`,
        permissions: ['staff:manage'],
      });
      assert.equal(teamRoleResponse.status, 201, 'Owner can create a scoped business role');
      const teamRole = await responseData<{ id: string }>(teamRoleResponse);
      const managerResponse = await apiRequest('/api/v1/business/staff', ownerToken, 'POST', {
        name: 'Acceptance Sync Manager',
        email: `sync-manager-${suffix}@example.test`,
        initialPassword: 'acceptance-test-password-16',
        roleId: teamRole.id,
      });
      assert.equal(managerResponse.status, 201, 'Owner can create a member using a business-scoped role');
      const manager = await responseData<{ id: string; user: { id: string } }>(managerResponse);
      createdUserIds.push(manager.user.id);
      const managerToken = tokenFor(manager.user.id, manager.id);
      const escalatedRoleResponse = await apiRequest('/api/v1/business/roles', managerToken, 'POST', {
        name: 'Unauthorized Settings Admin',
        permissions: ['settings:manage'],
      });
      assert.equal(escalatedRoleResponse.status, 403, 'staff managers cannot grant permissions they do not hold');
      const ownerAssignmentResponse = await apiRequest('/api/v1/business/staff', ownerToken, 'POST', {
        name: 'Unauthorized Owner',
        email: `unauthorized-owner-${suffix}@example.test`,
        initialPassword: 'acceptance-test-password-16',
        roleId: ownerRole.id,
      });
      assert.equal(ownerAssignmentResponse.status, 403, 'business APIs cannot assign the protected Owner role');
    }

    const customerResponse = await apiRequest('/api/v1/customers', ownerToken, 'POST', {
      name: `Demo ${template.name} Customer`,
      phone: '+923001234567',
      notes: `Acceptance scenario for ${template.name}`,
    });
    assert.equal(customerResponse.status, 201);
    const customer = await responseData<{ id: string }>(customerResponse);

    const itemType = effectiveConfiguration.itemTypes[0]!;
    const catalogFields = fieldsFor(effectiveConfiguration.fields, 'catalog', ['item', 'catalog-item']);
    const catalogName = `${itemType.label} API acceptance order`;
    const catalogResponse = await apiRequest('/api/v1/catalog', ownerToken, 'POST', {
      typeKey: itemType.key,
      name: catalogName,
      description: `Made-to-order ${itemType.label.toLowerCase()} for ${template.name}`,
      unit: 'piece',
      unitPrice: '25000.00',
      customFields: customFieldInput(catalogFields),
    });
    assert.equal(catalogResponse.status, 201, `${template.key} catalog API accepts the configured item`);
    const catalogItem = await responseData<{ id: string; typeKey: string; customFields: Record<string, unknown> }>(catalogResponse);
    assert.equal(catalogItem.typeKey, itemType.key);
    assert.deepEqual(Object.keys(catalogItem.customFields).sort(), catalogFields.map(({ key }) => key).sort());
    const catalogListResponse = await apiRequest(`/api/v1/catalog?typeKey=${itemType.key}`, ownerToken);
    assert.equal(catalogListResponse.status, 200);
    const catalogList = await responseData<{ items: Array<{ id: string }> }>(catalogListResponse);
    assert.ok(catalogList.items.some(({ id }) => id === catalogItem.id));

    if (index === 0) {
      const clientOperationId = randomUUID();
      const syncedItemId = randomUUID();
      const operation = {
        clientOperationId,
        entityType: 'catalog_item',
        entityId: syncedItemId,
        payload: {
          action: 'catalog.create',
          item: {
            typeKey: itemType.key,
            name: `${itemType.label} Offline Acceptance Sample`,
            description: 'Catalog item created through the idempotent sync outbox',
            unit: 'piece',
            unitPrice: '18000.00',
            customFields: customFieldInput(catalogFields),
          },
        },
      };
      const syncBatch = { operations: [operation] };
      const firstSyncResponse = await apiRequest('/api/v1/sync/operations', ownerToken, 'POST', syncBatch);
      assert.equal(firstSyncResponse.status, 200, 'catalog.create outbox operation is applied');
      const firstSync = await responseData<{ results: Array<{
        status: string;
        response: { id: string; typeKey: string; name: string };
        duplicate?: boolean;
      }> }>(firstSyncResponse);
      assert.equal(firstSync.results[0]?.status, 'APPLIED');
      assert.equal(firstSync.results[0]?.response.id, syncedItemId);
      assert.equal(firstSync.results[0]?.duplicate, undefined);

      const replayResponse = await apiRequest('/api/v1/sync/operations', ownerToken, 'POST', syncBatch);
      assert.equal(replayResponse.status, 200, 'replaying the same catalog.create operation succeeds idempotently');
      const replay = await responseData<{ results: Array<{
        status: string;
        response: { id: string; typeKey: string; name: string };
        duplicate?: boolean;
      }> }>(replayResponse);
      assert.equal(replay.results[0]?.duplicate, true);
      assert.equal(replay.results[0]?.response.id, firstSync.results[0]?.response.id);
      assert.equal(replay.results[0]?.response.name, firstSync.results[0]?.response.name);
      assert.equal(await prisma.syncOperation.count({
        where: { businessId: business.id, clientOperationId },
      }), 1);
      assert.equal(await prisma.businessItem.count({
        where: { businessId: business.id, id: syncedItemId },
      }), 1);
    }

    const orderFields = fieldsFor(effectiveConfiguration.fields, 'orders', ['order', 'job']);
    const orderItemFields = fieldsFor(effectiveConfiguration.fields, 'orders', ['item', 'order-item']);
    const initialStage = effectiveConfiguration.workflow.stages.find(({ isInitial }) => isInitial);
    assert.ok(initialStage, `${template.key} defines an initial stage`);
    const orderResponse = await apiRequest('/api/v1/orders', ownerToken, 'POST', {
      customerId: customer.id,
      promisedAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      customFields: customFieldInput(orderFields),
      items: [{
        itemTypeKey: itemType.key,
        itemName: catalogName,
        quantity: 1,
        unitPrice: '25000.00',
        customFields: customFieldInput(orderItemFields),
      }],
    });
    assert.equal(
      orderResponse.status,
      201,
      `${template.key} order API accepts the configured fields: ${await orderResponse.clone().text()}`,
    );
    const createdOrder = await responseData<{
      id: string;
      version: number;
      workflowStageKey: string;
      currentWorkflowStage: { key: string };
      items: Array<{ itemId: string; itemTypeKey: string }>;
    }>(orderResponse);
    assert.equal(createdOrder.items.length, 1);
    assert.equal(createdOrder.workflowStageKey, initialStage.key);
    assert.equal(createdOrder.items[0]?.itemTypeKey, itemType.key);
    assert.equal(createdOrder.items[0]?.itemId, catalogItem.id);
    if (index === 0) firstOrderId = createdOrder.id;
    if (index === 1 && firstOrderId) {
      const crossTenantRead = await apiRequest(`/api/v1/orders/${firstOrderId}`, ownerToken);
      assert.equal(crossTenantRead.status, 404, 'membership-scoped JWTs cannot read another tenant order');
    }

    const firstTransition = effectiveConfiguration.workflow.transitions.find(({ fromStageId }) =>
      fromStageId === initialStage.id);
    assert.ok(firstTransition, `${template.key} allows a transition from its initial stage`);
    const nextStage = effectiveConfiguration.workflow.stages.find(({ id }) => id === firstTransition.toStageId);
    assert.ok(nextStage, `${template.key} transition target is configured`);
    const workflowResponse = await apiRequest(`/api/v1/orders/${createdOrder.id}/workflow`, ownerToken, 'POST', {
      toStageKey: nextStage.key,
      version: createdOrder.version,
      note: `Advance ${template.name} acceptance order`,
    });
    assert.equal(workflowResponse.status, 200, `${template.key} workflow API advances the order`);
    const transitionedOrder = await responseData<{ workflowStageKey: string; currentWorkflowStage: { key: string } }>(workflowResponse);
    assert.equal(transitionedOrder.workflowStageKey, nextStage.key);
    assert.equal(transitionedOrder.currentWorkflowStage.key, nextStage.key);

    const orderListResponse = await apiRequest('/api/v1/orders?limit=100', ownerToken);
    assert.equal(orderListResponse.status, 200);
    const orderList = await responseData<{ items: Array<{
      id: string;
      customFields: Record<string, unknown>;
      items: Array<{ customFields: Record<string, unknown> }>;
      workflowStageKey: string;
    }> }>(orderListResponse);
    const persistedOrder = orderList.items.find(({ id }) => id === createdOrder.id);
    assert.ok(persistedOrder, `${template.key} order is visible through the scoped API`);
    assert.equal(persistedOrder.workflowStageKey, nextStage.key);
    assert.deepEqual(Object.keys(persistedOrder.customFields ?? {}).sort(), orderFields.map(({ key }) => key).sort());
    assert.deepEqual(
      Object.keys(persistedOrder.items[0]?.customFields ?? {}).sort(),
      orderItemFields.map(({ key }) => key).sort(),
    );
  }
});
