import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Startup guard against running application code on an out-of-date database
 * schema (Phase-1 follow-up to the P2022 incident: new code selected
 * `User.mustChangePassword` while the deployed database had not received the
 * `20261019120000_admin_password_reset` migration, so every sign-in failed
 * with "The column User.mustChangePassword does not exist in the current
 * database").
 *
 * The guard compares the migration folders committed to the repository with
 * the rows of Prisma's `_prisma_migrations` bookkeeping table. It is read-only
 * and never applies migrations itself — `prisma migrate deploy` (the `migrate`
 * Docker target, `npm run db:migrate`, or the runtime container entrypoint)
 * remains the only way the schema changes.
 */

/** One row of the Prisma `_prisma_migrations` bookkeeping table. */
export type MigrationRow = {
  migration_name: string;
  finished_at: Date | string | null;
  rolled_back_at: Date | string | null;
};

export type MigrationCounts = {
  /** Committed migrations recorded as successfully applied and not rolled back. */
  applied: string[];
  /** Committed migration folders with no (finished) row in the database. */
  pending: string[];
  /** Migrations that started but never finished and were not rolled back. */
  failed: string[];
};

export type MigrationStatus = MigrationCounts & {
  status: 'up-to-date' | 'pending' | 'failed' | 'unknown';
  /** Why the status could not be determined when `status` is `unknown`. */
  reason?: string;
};

/** Directory the Prisma CLI resolves migrations from (relative to the CWD). */
export function defaultMigrationsDirectory(): string {
  return path.resolve('prisma', 'migrations');
}

/** Migration folder names in the given `prisma/migrations` directory. */
export function listLocalMigrationNames(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Compare committed migration folders with `_prisma_migrations` rows. */
export function computeMigrationCounts(
  available: string[],
  rows: MigrationRow[],
): MigrationCounts {
  const finished = new Set<string>();
  const failed = new Set<string>();
  for (const row of rows) {
    if (row.rolled_back_at != null) continue;
    if (row.finished_at != null) finished.add(row.migration_name);
    // A row that started but never finished is reported even when its folder
    // no longer exists locally: it blocks `prisma migrate deploy` and must be
    // resolved (or rolled back) by an operator.
    else failed.add(row.migration_name);
  }
  return {
    applied: available.filter((name) => finished.has(name)).sort(),
    pending: available.filter((name) => !finished.has(name) && !failed.has(name)).sort(),
    failed: [...failed].sort(),
  };
}

/**
 * Determine the migration status of the database behind `queryRows`.
 *
 * Pass a callback that selects `migration_name, finished_at, rolled_back_at`
 * from `_prisma_migrations`. When the callback throws (no connectivity, or a
 * database that Prisma never migrated, which has no `_prisma_migrations`
 * table), the status is `unknown` and the caller decides whether to proceed —
 * the liveness design of the API allows starting without a reachable database.
 */
export async function checkMigrationStatus(
  queryRows: () => Promise<MigrationRow[]>,
  migrationsDir: string = defaultMigrationsDirectory(),
): Promise<MigrationStatus> {
  if (!existsSync(migrationsDir)) {
    return {
      status: 'unknown',
      applied: [],
      pending: [],
      failed: [],
      reason: `migrations directory not found at ${migrationsDir}`,
    };
  }
  let rows: MigrationRow[];
  try {
    rows = await queryRows();
  } catch (error) {
    return {
      status: 'unknown',
      applied: [],
      pending: [],
      failed: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const counts = computeMigrationCounts(listLocalMigrationNames(migrationsDir), rows);
  if (counts.failed.length > 0) return { status: 'failed', ...counts };
  if (counts.pending.length > 0) return { status: 'pending', ...counts };
  return { status: 'up-to-date', ...counts };
}

/**
 * Actionable message for a stale schema, or `null` when nothing needs to be
 * done. The wording names the exact failure operators saw in production and
 * the two supported ways to apply migrations.
 */
export function describeMigrationAction(status: MigrationStatus): string | null {
  if (status.status === 'failed') {
    return [
      'Database migrations are in a failed state (started but never finished):',
      ...status.failed.map((name) => `  - ${name}`),
      'Inspect them with `prisma migrate status` and resolve the failures before restarting the API.',
    ].join('\n');
  }
  if (status.status === 'pending') {
    return [
      `Database schema is out of date: ${status.pending.length} migration(s) have not been applied:`,
      ...status.pending.map((name) => `  - ${name}`),
      'Requests will fail (for example: "The column User.mustChangePassword does not exist in the current database").',
      'Apply migrations with `npm run db:migrate` (prisma migrate deploy) against this DATABASE_URL,',
      'or run the migrate Docker target, then restart the API.',
    ].join('\n');
  }
  return null;
}
