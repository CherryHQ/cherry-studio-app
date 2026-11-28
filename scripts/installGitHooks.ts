import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const requireFromProject = createRequire(resolve('package.json'));
const hookLauncher = readFileSync(resolve('scripts/runPrek.sh'), 'utf8');
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const result = spawnSync(
  process.execPath,
  [
    requireFromProject.resolve('@j178/prek/bin/prek.js'),
    'install',
    '--hook-command',
    `/bin/sh -c ${shellQuote(hookLauncher)} prek-hook`,
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}
