#!/usr/bin/env node
/**
 * Compiles every `@tailor/shared` copy this workspace can end up importing.
 *
 * `web/` is deployable on its own (Vercel with Root Directory = `web`) and ships
 * a local copy of the shared contracts in `web/shared`, which is built here.
 *
 * Inside the monorepo, npm resolves the `@tailor/shared` name declared as
 * `file:./shared` against the root workspace `packages/shared` instead of the
 * local copy, so `tsc` and Vite load `packages/shared/dist`. On a fresh clone
 * that folder is empty because build outputs are git-ignored, which failed the
 * build with "Cannot find module '@tailor/shared'". Build whichever copy exists.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  path.join(webRoot, 'shared'),
  path.join(webRoot, '..', 'packages', 'shared'),
];

for (const copy of copies) {
  if (!existsSync(path.join(copy, 'package.json'))) continue;
  const label = path.relative(webRoot, copy) || '.';
  console.log(`\n> @tailor/shared (${label})\n`);
  execFileSync('npm', ['run', 'build', '--prefix', copy], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
