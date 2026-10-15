#!/usr/bin/env node
/**
 * Compiles every `@tailor/shared` copy this workspace can end up importing.
 *
 * `backend/` is deployable on its own and ships a local copy of the shared
 * contracts in `backend/shared`, which is built here.
 *
 * Inside the monorepo, npm resolves the `@tailor/shared` name declared as
 * `file:./shared` against the root workspace `packages/shared` instead of
 * the local copy (the workspace wins the package name, and there is no
 * `backend/node_modules/@tailor/shared` at all). The compiler therefore
 * reads `packages/shared/dist`. Building only `./shared` left that dist
 * stale — `payment.routes.ts` uses `financialAccountId`, which existed in
 * `backend/shared` but not yet in `packages/shared`, and the backend
 * typecheck failed with TS2339 even though the field was "right there" in
 * the local copy. Build whichever copies exist so the resolved one is
 * always fresh.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  path.join(backendRoot, 'shared'),
  path.join(backendRoot, '..', 'packages', 'shared'),
];

for (const copy of copies) {
  if (!existsSync(path.join(copy, 'package.json'))) continue;
  const label = path.relative(backendRoot, copy) || '.';
  console.log(`\n> @tailor/shared (${label})\n`);
  execFileSync('npm', ['run', 'build', '--prefix', copy], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
