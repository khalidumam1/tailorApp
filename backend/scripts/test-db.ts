import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironmentFile } from '../src/environment.js';
import { requireIsolatedTestDatabaseUrl } from '../src/testing/isolated-test-database.js';

loadEnvironmentFile();

const testDatabaseUrl = requireIsolatedTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpm(args: string[], databaseUrl: string, label: string, extra: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync(npmCommand, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...extra, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed${result.status === null ? '' : ` with exit code ${result.status}`}`);
  }
}

runNpm(['run', 'db:migrate', '--workspace', '@tailor/api'], testDatabaseUrl, 'Test database migrations');
runNpm(['run', 'db:seed', '--workspace', '@tailor/api'], testDatabaseUrl, 'Test database seed');

const integrationEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  TEST_DATABASE_URL: testDatabaseUrl,
  RUN_DB_TESTS: 'true',
  ALLOW_SHARED_TEST_DATABASE: 'false',
};
const testResult = spawnSync(npmCommand, ['test', '--workspace', '@tailor/api'], {
  cwd: repositoryRoot,
  env: integrationEnvironment,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (testResult.error) throw testResult.error;
if (testResult.status !== 0) {
  throw new Error(`Database-backed backend tests failed${testResult.status === null ? '' : ` with exit code ${testResult.status}`}`);
}
