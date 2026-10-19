import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { app, logger } from './app.js';
import { env } from './config.js';
import { prisma } from './db.js';
import {
  checkMigrationStatus,
  describeMigrationAction,
  type MigrationRow,
} from './schema-check.js';
import { startWhatsAppWorker } from './whatsapp.js';

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  // Refuse to serve against a stale schema: a missing column surfaces as
  // cryptic P2022 errors on individual requests otherwise. The check is
  // read-only; migrations are applied by `prisma migrate deploy` (the runtime
  // container entrypoint, the migrate image target, or `npm run db:migrate`).
  const migrationStatus = await checkMigrationStatus(
    () => prisma.$queryRaw<MigrationRow[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`,
  );
  const staleSchemaMessage = describeMigrationAction(migrationStatus);
  if (staleSchemaMessage) {
    logger.error({ migrationStatus }, 'Refusing to start with an out-of-date database schema');
    // Also write to stderr directly so the message cannot be lost to log
    // buffering when the process exits immediately afterwards.
    process.stderr.write(`${staleSchemaMessage}\n`);
    process.exit(1);
  }
  if (migrationStatus.status === 'unknown') {
    logger.warn({ reason: migrationStatus.reason }, 'Could not verify database migration state at startup');
  } else {
    logger.info({ applied: migrationStatus.applied.length }, 'Database schema is up to date');
  }

  let whatsappWorker: NodeJS.Timeout | undefined;
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Tailor API listening');
    whatsappWorker = startWhatsAppWorker(logger);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    if (whatsappWorker) clearInterval(whatsappWorker);
    server.close(async (error) => {
      await prisma.$disconnect();
      if (error) {
        logger.error({ err: error }, 'Server shutdown failed');
        process.exitCode = 1;
      }
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
