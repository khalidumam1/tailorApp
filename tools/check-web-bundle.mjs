#!/usr/bin/env node
/**
 * Web bundle budget (Phase 2 task 2.4, F-009).
 *
 * Guards the initial (entry) JS chunk so it can only shrink from the Phase 2
 * baseline. Lazy chunks (ERP workspace, chat assistant, settings editors)
 * are reported for information but not budgeted — they load on demand.
 *
 * Phase 2 baseline: 502,020 bytes entry (was 584 kB before splitting).
 * Target: < 300,000 bytes, which requires extracting the platform console
 * out of main.tsx (decision D-8 follow-up). Lower ENTRY_BUDGET_BYTES as
 * that work lands; never raise it without recording why in the phase report.
 *
 * RAISED 510,000 -> 545,000 (2026-11-04), reason recorded here as required:
 * zod had to move from 3.24.2 to 4.6.7 for GHSA-mrhx-c7xc-m3w5 (high), and
 * zod 4 costs ~23 kB more in the entry chunk because `z` is a namespace
 * object that no bundler can tree-shake (measured: a one-schema bundle is
 * 103 kB with zod 4 vs 75 kB with zod 3; `zod/v4/mini` would be 27 kB but
 * its functional API is not source-compatible with these schemas, and
 * `treeshake: 'smallest'` recovers only ~0.1 kB). Entry went 509,013 ->
 * 531,925 bytes. The < 300,000 target and the D-8 extraction stand; lower
 * this number again when that work lands.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ENTRY_BUDGET_BYTES = 545_000;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(repoRoot, 'web', 'dist', 'assets');
const indexHtml = readFileSync(path.join(repoRoot, 'web', 'dist', 'index.html'), 'utf8');

const entryMatch = indexHtml.match(/src="[^"]*assets\/(index-[^"]+\.js)"/);
if (!entryMatch) {
  console.error('Could not find the entry chunk in web/dist/index.html — did the web build run?');
  process.exit(1);
}
const entryFile = entryMatch[1];
const entryBytes = statSync(path.join(assetsDir, entryFile)).size;
const entryGzip = gzipSync(readFileSync(path.join(assetsDir, entryFile))).length;

console.log(`Entry chunk: ${entryFile} — ${entryBytes} bytes (${entryGzip} gzip), budget ${ENTRY_BUDGET_BYTES}`);
for (const file of readdirSync(assetsDir).filter((name) => name.endsWith('.js') && name !== entryFile).sort()) {
  console.log(`  lazy chunk: ${file} — ${statSync(path.join(assetsDir, file)).size} bytes`);
}

if (entryBytes > ENTRY_BUDGET_BYTES) {
  console.error(`\nEntry chunk exceeds the ${ENTRY_BUDGET_BYTES}-byte budget. Split code out of the entry (React.lazy) instead of raising the budget.`);
  process.exit(1);
}
console.log('Bundle budget OK.');
