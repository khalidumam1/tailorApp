import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';

export function loadEnvironmentFile(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ];
  const envFile = candidates.find((candidate) => existsSync(candidate));
  if (!envFile) return;
  const result = loadDotEnv({ path: envFile });
  if (result.error) throw result.error;
}
