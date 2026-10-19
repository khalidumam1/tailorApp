import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 3 (task 3.4) browser E2E. CI starts the API (isolated `e2e`
 * Postgres schema, seeded demo tenant) and `vite preview`; see the
 * "E2E" step in .github/workflows/ci.yml. Locally: start both the same
 * way, then `npm run test:e2e --workspace @tailor/web`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
