#!/usr/bin/env node
/**
 * Shared-contract drift guard (task 1.8, finding F-011).
 *
 * The `@tailor/shared` contracts exist in four places so each app can deploy
 * standalone:
 *   - packages/shared  (canonical source of truth)
 *   - backend/shared, web/shared, mobile/shared  (byte-identical copies)
 *
 * This script fails (exit 1) when any copy differs from the canonical one.
 * Fix drift with:  npm run sync:shared
 *
 * Build outputs (dist/) and node_modules are ignored; everything else
 * (src/, package.json, tsconfig.json, ...) must match byte for byte.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalDir = path.join(repoRoot, 'packages', 'shared');
const copyDirs = ['backend', 'web', 'mobile'].map((app) => ({
  app,
  dir: path.join(repoRoot, app, 'shared'),
}));
// package-lock.json is an install artifact (only mobile/shared carries one,
// from standalone installs); the contract is src/ + package.json + tsconfig.
const IGNORED = new Set(['dist', 'node_modules', 'package-lock.json']);

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
    else if (statSync(full).isFile()) out.push(path.relative(base, full));
  }
  return out.sort();
}

let failures = 0;

for (const { app, dir } of copyDirs) {
  if (!existsSync(dir)) {
    console.error(`✗ ${app}/shared is missing`);
    failures += 1;
    continue;
  }
  const canonicalFiles = listFiles(canonicalDir);
  const copyFiles = listFiles(dir);
  const problems = [];

  for (const file of canonicalFiles) {
    if (!copyFiles.includes(file)) problems.push(`missing ${file}`);
    else if (!readFileSync(path.join(canonicalDir, file)).equals(readFileSync(path.join(dir, file)))) {
      problems.push(`differs ${file}`);
    }
  }
  for (const file of copyFiles) {
    if (!canonicalFiles.includes(file)) problems.push(`extra ${file}`);
  }

  if (problems.length) {
    failures += 1;
    console.error(`✗ ${app}/shared has drifted from packages/shared:`);
    for (const problem of problems) console.error(`    ${problem}`);
  } else {
    console.log(`✓ ${app}/shared matches packages/shared (${canonicalFiles.length} files)`);
  }
}

if (failures) {
  console.error('\nShared contracts have drifted. Edit packages/shared, then run: npm run sync:shared');
  process.exit(1);
}
console.log('\nAll shared contract copies are in sync.');
