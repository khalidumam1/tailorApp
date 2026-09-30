import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const monorepoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, monorepoRoot, '');

  return {
    plugins: [react()],
    envDir: monorepoRoot,
    define: {
      'import.meta.env.API_BASE_URL': JSON.stringify(
        env.API_BASE_URL ?? env.VITE_API_BASE_URL ?? 'http://localhost:5000',
      ),
    },
    server: {
      port: 5173,
    },
  };
});
