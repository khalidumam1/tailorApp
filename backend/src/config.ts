import { z } from 'zod';
import { loadEnvironmentFile } from './environment.js';

loadEnvironmentFile();

const optionalSecret = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  z.string().trim().min(1).optional(),
);

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
      if (!URL.canParse(origin)) return false;
      const parsed = new URL(origin);
      return parsed.origin === origin && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
    }), 'CORS_ORIGINS must contain only HTTP(S) origins'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WHATSAPP_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  WHATSAPP_ACCESS_TOKEN: optionalSecret,
  WHATSAPP_PHONE_NUMBER_ID: optionalSecret,
  WHATSAPP_VERIFY_TOKEN: optionalSecret,
  META_APP_SECRET: optionalSecret,
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v26.0'),
  WHATSAPP_ORDER_TEMPLATE: z.string().trim().min(1).default('tailor_order_created'),
  WHATSAPP_PAYMENT_TEMPLATE: z.string().trim().min(1).default('tailor_payment_received'),
  WHATSAPP_READY_TEMPLATE: z.string().trim().min(1).default('tailor_order_ready'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/).default('en'),
}).superRefine((value, context) => {
  if (!value.WHATSAPP_ENABLED) return;
  for (const key of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET'] as const) {
    if (!value[key]) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when WhatsApp is enabled` });
  }
});

export const env = environmentSchema.parse(process.env);
export const corsOrigins = new Set(env.CORS_ORIGINS);

if (env.NODE_ENV === 'production' && corsOrigins.has('http://localhost:5173')) {
  throw new Error('Production CORS_ORIGINS must not include the local development origin');
}
