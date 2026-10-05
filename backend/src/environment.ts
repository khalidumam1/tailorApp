import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';

export function loadEnvironmentFile(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ];
  for (const envFile of new Set(candidates.filter((candidate) => existsSync(candidate)))) {
    const result = loadDotEnv({ path: envFile, override: false });
    if (result.error) throw result.error;
  }
}
