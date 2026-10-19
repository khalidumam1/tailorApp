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
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ENTRY_BUDGET_BYTES = 510_000;

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
