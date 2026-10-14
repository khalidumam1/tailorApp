import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moduleForBusinessPermission,
  resolveEffectiveBusinessModules,
  resolvePlatformEnabledModules,
} from '../src/business-module-policy.js';

test('businesses without a platform override keep their legacy template modules', () => {
  assert.deepEqual(
    resolvePlatformEnabledModules(['customers', 'orders', 'catalog'], null, false),
    ['customers', 'orders', 'catalog'],
  );
});

test('platform overrides are restricted to template modules and may disable every module', () => {
  assert.deepEqual(
    resolvePlatformEnabledModules(['customers', 'orders', 'catalog'], ['orders', 'unknown'], true),
    ['orders'],
  );
  assert.deepEqual(resolvePlatformEnabledModules(['customers', 'orders'], [], true), []);
  assert.deepEqual(resolvePlatformEnabledModules(['customers', 'orders'], 'not-an-array', true), []);
});

test('effective access intersects template support, platform allow-list and tenant selection', () => {
  assert.deepEqual(
    resolveEffectiveBusinessModules(
      ['customers', 'orders', 'catalog'],
      ['customers', 'orders', 'tenant-only'],
      ['orders', 'catalog'],
    ),
    ['orders'],
  );
});

test('existing route permissions map to their module while administrative permissions do not', () => {
  assert.equal(moduleForBusinessPermission('customers:write'), 'customers');
  assert.equal(moduleForBusinessPermission('reports:read'), 'reports');
  assert.equal(moduleForBusinessPermission('inventory:write'), 'inventory');
  assert.equal(moduleForBusinessPermission('purchasing:read'), 'purchasing');
  assert.equal(moduleForBusinessPermission('cashbook:write'), 'cashbook');
  assert.equal(moduleForBusinessPermission('accounting:manage'), 'accounting');
  assert.equal(moduleForBusinessPermission('settings:manage'), undefined);
  assert.equal(moduleForBusinessPermission('settings:manage', 'inventory'), 'inventory');
});
