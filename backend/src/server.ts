import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { app, logger } from './app.js';
import { env } from './config.js';
import { prisma } from './db.js';

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Tailor API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
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
