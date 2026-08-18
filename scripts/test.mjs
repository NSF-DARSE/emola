/**
 * Runs every test file in tests/.
 *
 * A hardcoded list in package.json silently skipped new files, and a glob does
 * not survive Windows' cmd, which does not expand it. Discovering the files
 * here means adding a test is enough to have it run.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const files = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => `tests/${f}`)
  .sort();

if (files.length === 0) {
  console.error('No test files found in tests/.');
  process.exit(1);
}

const result = spawnSync('npx', ['tsx', '--test', ...files], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
