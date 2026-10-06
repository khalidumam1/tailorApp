import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const monorepoRoot = path.resolve(projectRoot, '..');
const envDirectory = existsSync(path.join(monorepoRoot, 'packages', 'shared', 'package.json'))
  ? monorepoRoot
  : projectRoot;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDirectory, '');

  // Where the browser should send `/api/v1/...` calls.
  //
  // The default is now an EMPTY string, i.e. same-origin relative requests. The previous
  // default of `http://localhost:5000` was baked into the client bundle, so the browser
  // tried to reach the API on the *user's own machine*. That only ever worked when the
  // developer ran the API locally; in a container/preview/reverse-proxied deployment every
  // request failed (and it forced an avoidable cross-origin setup even locally).
  // Same-origin + a dev proxy works everywhere; set API_BASE_URL explicitly only when the
  // API really is served from another origin.
  const apiBaseUrl = process.env.API_BASE_URL
    ?? process.env.VITE_API_BASE_URL
    ?? env.API_BASE_URL
    ?? env.VITE_API_BASE_URL
    ?? '';

  // Server-side target for the dev proxy. This one stays absolute because Vite itself
  // (inside the container) performs the request, not the browser.
  const apiProxyTarget = process.env.API_PROXY_TARGET
    ?? env.API_PROXY_TARGET
    ?? 'http://127.0.0.1:5000';

  return {
    plugins: [react()],
    envDir: envDirectory,
    define: {
      'import.meta.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      // Only proxy when the client is using same-origin URLs; if an explicit absolute
      // API_BASE_URL was supplied the browser talks to that origin directly.
      ...(apiBaseUrl === ''
        ? { proxy: { '/api': { target: apiProxyTarget, changeOrigin: true } } }
        : {}),
    },
    preview: {
      port: 5173,
      host: true,
      allowedHosts: true,
      ...(apiBaseUrl === ''
        ? { proxy: { '/api': { target: apiProxyTarget, changeOrigin: true } } }
        : {}),
    },
  };
});
