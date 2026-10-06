import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const backendRoot = fileURLToPath(new URL('..', import.meta.url));

process.env.NODE_ENV = 'development';
process.env.PORT ??= '5000';
process.env.CORS_ORIGINS ??= [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].join(',');

const child = spawn(process.execPath, [tsxCli, 'watch', 'src/server.ts'], {
  cwd: resolve(backendRoot),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    child.kill(signal);
  });
}

child.once('error', (error) => {
  console.error('Unable to start the Tailor API development server:', error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (stopping && signal ? 0 : 1);
});
