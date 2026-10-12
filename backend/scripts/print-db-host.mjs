import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
];
for (const envFile of new Set(candidates.filter((candidate) => existsSync(candidate)))) {
  loadDotEnv({ path: envFile, override: false });
}

const url = process.env.DATABASE_URL || '';
const host = (url.match(/@([^:/?]+)/) || [])[1] || 'unknown';
console.log(JSON.stringify({
  host,
  isSupabase: host.includes('supabase'),
  isPrisma: host.includes('prisma.io'),
  hasUrl: Boolean(url),
}, null, 2));
