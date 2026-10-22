import { PrismaClient } from '@prisma/client';

export const DEFAULT_TRANSACTION_OPTIONS = {
  maxWait: 20_000,
  timeout: 30_000,
} as const;

// List endpoints load their relations as concurrent batches of flat queries
// (see routes/order.routes.ts). The default pool size (num_cpus * 2 + 1) is
// often smaller than one batch, which serializes the batch again on small
// containers. Ten connections comfortably covers one in-flight request plus
// light concurrency; deployments that need different sizing (for example
// behind a transaction pooler) can set `connection_limit` in DATABASE_URL and
// that value always wins.
const DEFAULT_CONNECTION_LIMIT = 10;

function withDefaultConnectionLimit(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  if (parsed.searchParams.has('connection_limit')) return databaseUrl;
  parsed.searchParams.set('connection_limit', String(DEFAULT_CONNECTION_LIMIT));
  return parsed.toString();
}

const databaseUrl = process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  // Without an explicit URL the client resolves `env("DATABASE_URL")` lazily,
  // matching previous behavior for test processes that never connect.
  ...(databaseUrl ? { datasourceUrl: withDefaultConnectionLimit(databaseUrl) } : {}),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  transactionOptions: DEFAULT_TRANSACTION_OPTIONS,
});
