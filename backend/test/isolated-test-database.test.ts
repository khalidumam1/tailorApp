import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireIsolatedTestDatabaseUrl } from '../src/testing/isolated-test-database.js';

test('database integration tests require a dedicated local test database', () => {
  assert.throws(
    () => requireIsolatedTestDatabaseUrl(undefined),
    /dedicated TEST_DATABASE_URL/,
  );
  assert.throws(
    () => requireIsolatedTestDatabaseUrl('postgresql://user:pass@db.example.com/app_test'),
    /local PostgreSQL/,
  );
  assert.throws(
    () => requireIsolatedTestDatabaseUrl('postgresql://user:pass@localhost/app'),
    /named for testing or acceptance/,
  );
});

test('database integration tests accept a named local test database distinct from the app target', () => {
  const testUrl = 'postgresql://user:pass@localhost:5432/tailor_acceptance_test';
  assert.equal(
    requireIsolatedTestDatabaseUrl(testUrl, 'postgresql://user:pass@db.example.com/tailor'),
    testUrl,
  );
  assert.throws(
    () => requireIsolatedTestDatabaseUrl(testUrl, testUrl),
    /must not match DATABASE_URL/,
  );
});

test('shared development database testing must be explicitly enabled and use the configured datasource', () => {
  const sharedUrl = 'postgresql://user:pass@db.example.com/postgres';
  assert.equal(requireIsolatedTestDatabaseUrl(sharedUrl, sharedUrl, true), sharedUrl);
  assert.throws(
    () => requireIsolatedTestDatabaseUrl(sharedUrl, 'postgresql://user:pass@db.example.com/other', true),
    /must use the configured DATABASE_URL exactly/,
  );
  assert.throws(
    () => requireIsolatedTestDatabaseUrl(sharedUrl, sharedUrl),
    /must not match DATABASE_URL/,
  );
});
