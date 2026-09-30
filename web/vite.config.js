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

  return {
    plugins: [react()],
    envDir: envDirectory,
    define: {
      'import.meta.env.API_BASE_URL': JSON.stringify(
        process.env.API_BASE_URL
          ?? process.env.VITE_API_BASE_URL
          ?? env.API_BASE_URL
          ?? env.VITE_API_BASE_URL
          ?? 'http://localhost:5000',
      ),
    },
    server: {
      port: 5173,
    },
  };
});
