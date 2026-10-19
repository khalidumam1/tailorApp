import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  checkMigrationStatus,
  computeMigrationCounts,
  describeMigrationAction,
  listLocalMigrationNames,
  type MigrationRow,
} from '../src/schema-check.js';

function row(
  name: string,
  overrides: Partial<MigrationRow> = {},
): MigrationRow {
  return { migration_name: name, finished_at: new Date(), rolled_back_at: null, ...overrides };
}

test('computeMigrationCounts separates applied, pending and failed migrations', () => {
  const available = [
    '20261019120000_admin_password_reset',
    '20261019123000_business_archived_status',
    '20261020100000_retire_offline_sync',
  ];
  const counts = computeMigrationCounts(available, [
    row('20261019120000_admin_password_reset'),
    row('20261019123000_business_archived_status', { finished_at: null }),
  ]);
  assert.deepEqual(counts.applied, ['20261019120000_admin_password_reset']);
  assert.deepEqual(counts.failed, ['20261019123000_business_archived_status']);
  assert.deepEqual(counts.pending, ['20261020100000_retire_offline_sync']);
});

test('rolled back rows do not count as applied', () => {
  const counts = computeMigrationCounts(['a', 'b'], [
    row('a', { rolled_back_at: new Date() }),
    row('b'),
  ]);
  assert.deepEqual(counts.applied, ['b']);
  assert.deepEqual(counts.pending, ['a']);
  assert.deepEqual(counts.failed, []);
});

test('database rows for migrations without a local folder are ignored', () => {
  const counts = computeMigrationCounts(['local_only'], [
    row('local_only'),
    row('database_only'),
  ]);
  assert.deepEqual(counts.applied, ['local_only']);
  assert.deepEqual(counts.pending, []);
});

test('listLocalMigrationNames returns sorted folder names only', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'schema-check-'));
  try {
    mkdirSync(path.join(dir, '20261019120000_admin_password_reset'));
    mkdirSync(path.join(dir, '20261020100000_retire_offline_sync'));
    assert.deepEqual(listLocalMigrationNames(dir), [
      '20261019120000_admin_password_reset',
      '20261020100000_retire_offline_sync',
    ]);
    assert.deepEqual(listLocalMigrationNames(path.join(dir, 'missing')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeMigrationDir(names: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'schema-check-'));
  const migrations = path.join(dir, 'migrations');
  mkdirSync(migrations);
  for (const name of names) mkdirSync(path.join(migrations, name));
  return migrations;
}

test('checkMigrationStatus reports up-to-date when every migration has a row', async () => {
  const migrations = makeMigrationDir(['a', 'b']);
  try {
    const status = await checkMigrationStatus(
      async () => [row('a'), row('b')],
      migrations,
    );
    assert.equal(status.status, 'up-to-date');
    assert.equal(describeMigrationAction(status), null);
  } finally {
    rmSync(path.dirname(migrations), { recursive: true, force: true });
  }
});

test('checkMigrationStatus reports pending migrations and an actionable message', async () => {
  const migrations = makeMigrationDir(['20261019120000_admin_password_reset', 'b']);
  try {
    const status = await checkMigrationStatus(async () => [row('b')], migrations);
    assert.equal(status.status, 'pending');
    const message = describeMigrationAction(status);
    assert.ok(message);
    assert.match(message, /20261019120000_admin_password_reset/);
    assert.match(message, /mustChangePassword/);
    assert.match(message, /npm run db:migrate/);
  } finally {
    rmSync(path.dirname(migrations), { recursive: true, force: true });
  }
});

test('checkMigrationStatus reports failed migrations distinctly', async () => {
  const migrations = makeMigrationDir(['a']);
  try {
    const status = await checkMigrationStatus(
      async () => [row('a', { finished_at: null })],
      migrations,
    );
    assert.equal(status.status, 'failed');
    assert.match(describeMigrationAction(status) ?? '', /failed state/);
  } finally {
    rmSync(path.dirname(migrations), { recursive: true, force: true });
  }
});

test('checkMigrationStatus returns unknown when the bookkeeping table cannot be read', async () => {
  const migrations = makeMigrationDir(['a']);
  try {
    const status = await checkMigrationStatus(async () => {
      throw new Error('The table `_prisma_migrations` does not exist');
    }, migrations);
    assert.equal(status.status, 'unknown');
    assert.match(status.reason ?? '', /_prisma_migrations/);
    assert.equal(describeMigrationAction(status), null);
  } finally {
    rmSync(path.dirname(migrations), { recursive: true, force: true });
  }
});

test('checkMigrationStatus returns unknown when the migrations directory is missing', async () => {
  const status = await checkMigrationStatus(async () => [], '/nonexistent/prisma/migrations');
  assert.equal(status.status, 'unknown');
  assert.match(status.reason ?? '', /migrations directory not found/);
});
