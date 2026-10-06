import { defineConfig } from 'prisma/config';
import { loadEnvironmentFile } from './src/environment.js';

loadEnvironmentFile();

// `prisma generate` only needs the schema, never a reachable database. Declaring the
// datasource url here unconditionally makes client generation fail whenever DATABASE_URL
// is unset (fresh clone, CI type-check step, Docker build), so only pass it through when
// it exists. Commands that genuinely need a connection (migrate/seed) still resolve it
// from `env("DATABASE_URL")` in prisma/schema.prisma and report the usual Prisma error.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
