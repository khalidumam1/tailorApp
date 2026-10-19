#!/usr/bin/env node
/**
 * Copies the canonical `@tailor/shared` contracts from packages/shared to the
 * per-app copies (backend/shared, web/shared, mobile/shared), so the copies
 * stay byte-identical (finding F-011). Build outputs (dist/) and node_modules
 * are left alone. Verify afterwards with:  npm run check:shared-drift
 */
import { cpSync, existsSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalDir = path.join(repoRoot, 'packages', 'shared');
const IGNORED = new Set(['dist', 'node_modules', 'package-lock.json']);

for (const app of ['backend', 'web', 'mobile']) {
  const targetDir = path.join(repoRoot, app, 'shared');
  // Remove stale source entries first so deleted canonical files disappear too.
  for (const entry of readdirSync(targetDir)) {
    if (IGNORED.has(entry)) continue;
    rmSync(path.join(targetDir, entry), { recursive: true, force: true });
  }
  cpSync(canonicalDir, targetDir, {
    recursive: true,
    filter: (source) => !IGNORED.has(path.basename(source)),
  });
  console.log(`✓ synced packages/shared -> ${app}/shared`);
}
console.log('Done. Run npm run check:shared-drift to verify.');
