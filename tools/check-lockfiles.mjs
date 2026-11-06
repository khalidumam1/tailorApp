#!/usr/bin/env node
/**
 * D-16 / deploy guard: every standalone (per-app) lockfile must stay in sync
 * with the package.json next to it.
 *
 * The monorepo root lockfile is exercised by `npm ci` in CI, but the app
 * folders carry their own package-lock.json as well. Those folders are what a
 * PaaS builder installs when it is pointed at `backend/`, `web/` or `mobile/`
 * instead of at the repository root, so a lockfile that drifted from its
 * package.json only breaks the deploy - not CI.
 *
 * That is exactly what happened: PR #37 raised zod to 4.6.7 in
 * backend/package.json but never regenerated backend/package-lock.json, and the
 * container build died with
 *
 *   Invalid: lock file's zod@3.24.2 does not satisfy zod@4.6.7
 *
 * The check below reproduces the deploy install for each standalone folder in
 * a throw-away directory (so the workspace root of this repository cannot
 * answer for it) and fails when the lockfile and the package.json disagree.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const targets = ['backend', 'web', 'mobile', 'mobile/shared'];

/** The shared copies that are installed from a local folder ("file:./shared"). */
const localCopies = ['shared'];

function syncProblems(output) {
  return output
    .split('\n')
    .filter((line) => /invalid:|missing:|does not satisfy|not in the lock file/i.test(line))
    .map((line) => line.trim());
}

let failed = false;

for (const target of targets) {
  const dir = join(repoRoot, target);
  const pkg = join(dir, 'package.json');
  const lock = join(dir, 'package-lock.json');

  if (!existsSync(pkg)) {
    console.log(`- ${target}: no package.json, skipped`);
    continue;
  }
  if (!existsSync(lock)) {
    console.log(`- ${target}: no standalone package-lock.json, skipped`);
    continue;
  }

  const sandbox = mkdtempSync(join(tmpdir(), `lockfile-check-${target.replace(/[\\/]/g, '-')}-`));
  try {
    cpSync(pkg, join(sandbox, 'package.json'));
    cpSync(lock, join(sandbox, 'package-lock.json'));
    for (const copy of localCopies) {
      if (existsSync(join(dir, copy))) {
        cpSync(join(dir, copy), join(sandbox, copy), { recursive: true });
      }
    }

    // `npm ls --package-lock-only` reads the lockfile only (no network, no
    // install scripts) and reports every edge that the lockfile cannot
    // satisfy, exactly like the deploy-time `npm ci` does.
    let output = '';
    let status = 0;
    try {
      output = execFileSync('npm', ['ls', '--package-lock-only', '--all'], {
        cwd: sandbox,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      status = error.status ?? 1;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    const problems = syncProblems(output);
    const declared = JSON.parse(readFileSync(pkg, 'utf8')).name ?? target;

    if (problems.length > 0) {
      failed = true;
      console.error(`✗ ${target} (${declared}): package-lock.json is out of sync with package.json`);
      for (const line of problems) console.error(`    ${line}`);
      console.error('    Fix: cd ' + target + ' && npm install --package-lock-only  (run it outside this repo so the workspace root does not answer for it)');
    } else {
      console.log(`✓ ${target} (${declared}): lockfile in sync${status ? ' (npm reported non-fatal problems)' : ''}`);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

if (failed) {
  console.error('\nStandalone lockfiles drifted from their package.json - a deploy that installs this folder would fail.');
  process.exit(1);
}

console.log('\nAll standalone lockfiles are in sync with their package.json.');
