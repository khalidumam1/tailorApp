/**
 * Public self-signup and the public plan list (DB-backed).
 *
 * Covers what the marketing site depends on and what makes self-signup safe to
 * expose: the plan list publishes nothing internal, the endpoint is off until
 * the platform turns it on, and a business created through it is immediately
 * usable — sign-in only offers memberships in ACTIVE businesses, so a new
 * owner who could not sign in would be the worst possible first impression.
 *
 * Requires RUN_DB_TESTS=true and TEST_DATABASE_URL, like the other database
 * suites. The business templates and the default trial plan come from
 * migrations, not the seed, so they are present after `npm run db:migrate`.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { requireIsolatedTestDatabaseUrl } from '../src/testing/isolated-test-database.js';

const enabled = process.env.RUN_DB_TESTS === 'true';
if (enabled) {
  process.env.DATABASE_URL = requireIsolatedTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.ALLOW_SHARED_TEST_DATABASE === 'true',
  );
}
process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';

const prisma = new PrismaClient();

let closeServer: (() => Promise<void>) | undefined;
let baseUrl = '';
const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];

interface ApiResult { status: number; body: Record<string, unknown>; }

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResult> {
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

async function setSelfSignup(value: boolean | null): Promise<void> {
  if (value === null) {
    await prisma.platformSetting.deleteMany({ where: { key: 'signup' } });
    return;
  }
  await prisma.platformSetting.upsert({
    where: { key: 'signup' },
    create: { key: 'signup', value: { enabled: value } },
    update: { value: { enabled: value } },
  });
}

function skipIfDisabled(context: { skip: (message?: string) => void }): boolean {
  if (enabled) return false;
  context.skip('RUN_DB_TESTS=true and TEST_DATABASE_URL are required');
  return true;
}

before(async () => {
  if (!enabled) return;
  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  };
});

after(async () => {
  if (!enabled) return;
  const businessIds = [...createdBusinessIds];
  if (businessIds.length > 0) {
    await prisma.subscriptionEvent.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.subscription.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.auditEvent.deleteMany({ where: { businessId: { in: businessIds } } });
    const roles = await prisma.role.findMany({
      where: { businessId: { in: businessIds } },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    if (roleIds.length > 0) {
      await prisma.rolePermissionGrant.deleteMany({ where: { roleId: { in: roleIds } } });
    }
    await prisma.membership.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.role.deleteMany({ where: { businessId: { in: businessIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await setSelfSignup(null);
  await closeServer?.();
  await prisma.$disconnect();
});

test('the public plan list publishes prices and nothing internal', async (t) => {
  if (skipIfDisabled(t)) return;
  const response = await api('/api/v1/public/plans');
  assert.equal(response.status, 200);
  const items = (response.body.data as { items: Record<string, unknown>[] }).items;
  assert.ok(items.length >= 1, 'at least one active plan is expected after migrations');

  for (const plan of items) {
    assert.deepEqual(Object.keys(plan).sort(), [
      'currency', 'description', 'features', 'id', 'limits',
      'monthlyPrice', 'name', 'trialDays', 'yearlyPrice',
    ]);
    assert.match(String(plan.monthlyPrice), /^\d+\.\d{2}$/);
    assert.match(String(plan.yearlyPrice), /^\d+\.\d{2}$/);
    assert.equal(typeof plan.trialDays, 'number');
  }
});

test('the public template list offers the shipped templates', async (t) => {
  if (skipIfDisabled(t)) return;
  const response = await api('/api/v1/public/templates');
  assert.equal(response.status, 200);
  const items = (response.body.data as { items: Array<{ key: string; name: string }> }).items;
  const keys = items.map((item) => item.key);
  assert.ok(keys.includes('tailor'), `expected the tailor template, got ${keys.join(', ')}`);
});

test('signup stays closed until the platform switches it on', async (t) => {
  if (skipIfDisabled(t)) return;
  await setSelfSignup(null);
  const response = await api('/api/v1/public/signup', {
    method: 'POST',
    body: {
      businessName: 'Switch Off Traders',
      templateKey: 'tailor',
      ownerName: 'Test Owner',
      email: `self-signup-off-${randomUUID()}@example.test`,
      password: 'correct-horse-battery',
    },
  });
  assert.equal(response.status, 403);
  assert.equal((response.body.error as { code: string }).code, 'SELF_SIGNUP_DISABLED');
});

test('a self-signed-up business is created active, with an owner who can sign in', async (t) => {
  if (skipIfDisabled(t)) return;
  await setSelfSignup(true);
  const email = `self-signup-${randomUUID()}@example.test`;
  const password = 'correct-horse-battery';

  const created = await api('/api/v1/public/signup', {
    method: 'POST',
    body: {
      businessName: 'Al-Noor Test Traders',
      templateKey: 'tailor',
      ownerName: 'Test Owner',
      email,
      password,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const data = created.body.data as {
    business: { id: string; name: string; slug: string };
    owner: { id: string; email: string };
    session: { accessToken: string; refreshToken: string };
    trial: { plan: string; trialDays: number; endsAt: string } | null;
  };
  assert.equal(data.owner.email, email);
  assert.equal(data.business.slug, 'al-noor-test-traders');
  assert.ok(data.session.accessToken.length > 0);
  assert.ok(data.session.refreshToken.length > 0);
  assert.ok(data.trial, 'a default plan with a trial should be provisioned');
  assert.equal(data.trial?.trialDays, 14);

  createdBusinessIds.push(data.business.id);
  createdUserIds.push(data.owner.id);

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: data.business.id },
    select: { status: true, templateId: true },
  });
  assert.equal(business.status, 'ACTIVE');
  assert.ok(business.templateId, 'the chosen template is attached');

  const membership = await prisma.membership.findFirstOrThrow({
    where: { businessId: data.business.id, userId: data.owner.id },
    include: { role: { select: { name: true } } },
  });
  assert.equal(membership.role.name, 'Owner');

  const subscription = await prisma.subscription.findFirstOrThrow({
    where: { businessId: data.business.id },
  });
  assert.equal(subscription.status, 'TRIAL');

  // The point of ACTIVE: the new owner reaches the workspace on the first try.
  const signedIn = await api('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  const session = signedIn.body.data as { business: { id: string } };
  assert.equal(session.business.id, data.business.id);
});

test('signup rejects a second business for the same email', async (t) => {
  if (skipIfDisabled(t)) return;
  await setSelfSignup(true);
  const email = `self-signup-dup-${randomUUID()}@example.test`;
  const payload = {
    businessName: 'Duplicate Traders',
    templateKey: 'tailor',
    ownerName: 'Test Owner',
    email,
    password: 'correct-horse-battery',
  };

  const first = await api('/api/v1/public/signup', { method: 'POST', body: payload });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const firstData = first.body.data as { business: { id: string }; owner: { id: string } };
  createdBusinessIds.push(firstData.business.id);
  createdUserIds.push(firstData.owner.id);

  const second = await api('/api/v1/public/signup', { method: 'POST', body: payload });
  assert.equal(second.status, 409);
  assert.equal((second.body.error as { code: string }).code, 'DUPLICATE_USER');
});

test('signup refuses an unknown template and a short password', async (t) => {
  if (skipIfDisabled(t)) return;
  await setSelfSignup(true);

  const unknownTemplate = await api('/api/v1/public/signup', {
    method: 'POST',
    body: {
      businessName: 'Bad Template Traders',
      templateKey: 'not-a-template',
      ownerName: 'Test Owner',
      email: `self-signup-template-${randomUUID()}@example.test`,
      password: 'correct-horse-battery',
    },
  });
  assert.equal(unknownTemplate.status, 400);
  assert.equal((unknownTemplate.body.error as { code: string }).code, 'BUSINESS_TEMPLATE_NOT_FOUND');

  const shortPassword = await api('/api/v1/public/signup', {
    method: 'POST',
    body: {
      businessName: 'Short Password Traders',
      templateKey: 'tailor',
      ownerName: 'Test Owner',
      email: `self-signup-password-${randomUUID()}@example.test`,
      password: 'short',
    },
  });
  assert.equal(shortPassword.status, 400);
  assert.equal((shortPassword.body.error as { code: string }).code, 'VALIDATION_ERROR');
});
