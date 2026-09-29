import { z } from 'zod';
import { loadEnvironmentFile } from './environment.js';

loadEnvironmentFile();

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgresql:' || protocol === 'postgres:';
  }, 'DATABASE_URL must use the PostgreSQL protocol'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1))
    .refine((origins) => origins.every((origin) => {
      const parsed = new URL(origin);
      return parsed.origin === origin && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
    }), 'CORS_ORIGINS must contain only HTTP(S) origins'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export const env = environmentSchema.parse(process.env);
export const corsOrigins = new Set(env.CORS_ORIGINS);

if (env.NODE_ENV === 'production' && corsOrigins.has('http://localhost:5173')) {
  throw new Error('Production CORS_ORIGINS must not include the local development origin');
}
