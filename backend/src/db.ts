import { PrismaClient } from '@prisma/client';

export const DEFAULT_TRANSACTION_OPTIONS = {
  maxWait: 20_000,
  timeout: 30_000,
} as const;

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  transactionOptions: DEFAULT_TRANSACTION_OPTIONS,
});

