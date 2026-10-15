#!/usr/bin/env node
/**
 * Compiles every `@tailor/shared` copy this workspace can end up importing.
 *
 * `mobile/` is deployable on its own and ships a local copy of the shared
 * contracts in `mobile/shared`, which is built here.
 *
 * Inside the monorepo, npm resolves the `@tailor/shared` name declared as
 * `file:./shared` against the root workspace `packages/shared` instead of
 * the local copy, so the compiler actually reads `packages/shared/dist`.
 * Building only `./shared` could leave that dist stale (this previously
 * broke the backend typecheck when the copies drifted). Build whichever
 * copies exist so the resolved one is always fresh.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  path.join(mobileRoot, 'shared'),
  path.join(mobileRoot, '..', 'packages', 'shared'),
];

for (const copy of copies) {
  if (!existsSync(path.join(copy, 'package.json'))) continue;
  const label = path.relative(mobileRoot, copy) || '.';
  console.log(`\n> @tailor/shared (${label})\n`);
  execFileSync('npm', ['run', 'build', '--prefix', copy], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
