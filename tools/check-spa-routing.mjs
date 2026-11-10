#!/usr/bin/env node
/**
 * D-17 / deploy guard: the web app must be served with a single-page-app
 * fallback, otherwise every deep link is a 404.
 *
 * The customer tracking link is a deep link: `https://<web-host>/track/<token>`.
 * The web app is a Vite single-page app, so the host has to answer that path
 * with the app shell (`index.html`) and let the client render the page. Without
 * that fallback the host answers `404 NOT_FOUND` and the customer sees a dead
 * link - which is exactly what happened on 2026-11-06.
 *
 * The Vercel project of this repository can be rooted either at the repository
 * root or at `web/`, and Vercel only reads `vercel.json` from the project
 * root. The rewrite therefore ships in both places, and this check makes sure
 * that at least one of them stays in place.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const candidates = ['vercel.json', join('web', 'vercel.json')];

const valid = [];
const problems = [];

for (const candidate of candidates) {
  const path = join(repoRoot, candidate);
  if (!existsSync(path)) continue;

  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(`${candidate}: not valid JSON (${error.message})`);
    continue;
  }

  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  const spaRewrite = rewrites.find((rewrite) => rewrite?.destination === '/index.html');
  if (!spaRewrite) {
    problems.push(`${candidate}: no rewrite to /index.html - deep links such as /track/<token> would 404`);
    continue;
  }

  // The API must keep working when it is routed through the same host.
  if (typeof spaRewrite.source !== 'string' || !/\(\?!api\//.test(spaRewrite.source)) {
    problems.push(`${candidate}: the rewrite does not exclude /api/ - a same-origin API would be swallowed by the app shell`);
    continue;
  }

  valid.push(`${candidate}: ${spaRewrite.source} -> ${spaRewrite.destination}`);
}

for (const line of valid) console.log(`✓ ${line}`);

// Only the file that sits in the Vercel project root is used, so a broken
// copy in the other location is a warning; a broken project root is fatal.
for (const line of problems) {
  if (valid.length > 0) console.warn(`! ${line}`);
  else console.error(`✗ ${line}`);
}

if (valid.length === 0) {
  console.error('✗ No vercel.json with a single-page-app rewrite found.');
  console.error('  The customer tracking link (/track/<token>) needs the web host to serve index.html for that path.');
  process.exit(1);
}

console.log('\nThe web host serves the app shell for deep links, so /track/<token> reaches the customer page.');
