import { defineConfig } from 'vitest/config';

// Web unit tests (task 1.6 / finding F-008). They exercise the typed API
// client against a stubbed global fetch — no DOM and no network required.
// Real browser/E2E coverage remains Phase 3 scope; these tests guard the
// request/response contract (envelope parsing, error mapping, query building).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
