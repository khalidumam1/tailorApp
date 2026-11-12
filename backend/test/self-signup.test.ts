/**
 * Unit tests for the pieces of public self-signup that need no database.
 *
 * The rules here are the ones a public endpoint has to get right without a
 * safety net: a slug that is always unique and always URL-shaped, a kill
 * switch that fails closed, and a plan payload that shows a buyer the price
 * and nothing else.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Prisma } from '@prisma/client';
import {
  findAvailableSlug,
  isSelfSignupEnabled,
  slugify,
  toPublicPlan,
} from '../src/self-signup.js';

test('slugify produces a lowercase, hyphen-separated, ASCII slug', () => {
  assert.equal(slugify('Al-Noor Furniture'), 'al-noor-furniture');
  assert.equal(slugify('Zahid  Auto   Workshop'), 'zahid-auto-workshop');
  assert.equal(slugify('  Karachi Print House!! '), 'karachi-print-house');
  assert.equal(slugify('Café Möbel'), 'cafe-mobel');
});

test('slugify trims to the column width without leaving a trailing hyphen', () => {
  const long = slugify('a'.repeat(200));
  assert.equal(long.length, 80);
  const truncated = slugify(`${'b'.repeat(79)}- ${'c'.repeat(20)}`);
  assert.ok(truncated.length <= 80, truncated);
  assert.ok(!truncated.endsWith('-'), truncated);
});

test('slugify returns an empty string when nothing survives cleaning', () => {
  assert.equal(slugify('★★★'), '');
  assert.equal(slugify('---'), '');
});

test('findAvailableSlug returns the base slug when it is free', async () => {
  const asked: string[] = [];
  const slug = await findAvailableSlug('acme', async (candidate) => {
    asked.push(candidate);
    return false;
  });
  assert.equal(slug, 'acme');
  assert.deepEqual(asked, ['acme']);
});

test('findAvailableSlug walks to the next free suffix', async () => {
  const taken = new Set(['acme', 'acme-2', 'acme-3']);
  const slug = await findAvailableSlug('acme', async (candidate) => taken.has(candidate));
  assert.equal(slug, 'acme-4');
});

test('findAvailableSlug gives up on a crowded base rather than looping forever', async () => {
  let calls = 0;
  const slug = await findAvailableSlug('shop', async () => {
    calls += 1;
    return true;
  });
  assert.equal(calls, 50);
  assert.match(slug, /^shop-[0-9a-f]{8}$/);
  assert.ok(slug.length <= 80);
});

test('the signup switch fails closed: anything but enabled true means off', () => {
  assert.equal(isSelfSignupEnabled(undefined), false);
  assert.equal(isSelfSignupEnabled(null), false);
  assert.equal(isSelfSignupEnabled('yes'), false);
  assert.equal(isSelfSignupEnabled({}), false);
  assert.equal(isSelfSignupEnabled({ enabled: false }), false);
  assert.equal(isSelfSignupEnabled({ enabled: 'true' }), false);
  assert.equal(isSelfSignupEnabled({ somethingElse: true }), false);
  assert.equal(isSelfSignupEnabled({ enabled: true }), true);
});

test('toPublicPlan rounds money to two decimals and exposes no internal fields', () => {
  // A stand-in for Prisma.Decimal: the only thing the mapper needs from it is
  // toFixed, and a type-only import keeps this file runnable without a
  // generated client.
  const decimal = (value: string) => ({
    toFixed: (digits: number) => Number(value).toFixed(digits),
  }) as unknown as Prisma.Decimal;
  const mapped = toPublicPlan({
    id: '3f1b7b9e-2f4a-4e0d-9c2a-1d5f0a7b3c11',
    name: 'Growth',
    description: 'For a shop with staff and stock',
    monthlyPrice: decimal('6000'),
    yearlyPrice: decimal('60000.5'),
    currency: 'PKR',
    trialDays: 14,
    features: { notifications: true },
    limits: { staff: 10 },
  } as Parameters<typeof toPublicPlan>[0]) as Record<string, unknown>;

  assert.deepEqual(mapped, {
    id: '3f1b7b9e-2f4a-4e0d-9c2a-1d5f0a7b3c11',
    name: 'Growth',
    description: 'For a shop with staff and stock',
    monthlyPrice: '6000.00',
    yearlyPrice: '60000.50',
    currency: 'PKR',
    trialDays: 14,
    features: { notifications: true },
    limits: { staff: 10 },
  });
  // Anything an operator sees in the console and a buyer should not.
  for (const leaked of ['active', 'isDefault', 'createdAt', 'updatedAt', 'subscriptions', 'payments']) {
    assert.ok(!(leaked in mapped), `${leaked} must not be published`);
  }
});
