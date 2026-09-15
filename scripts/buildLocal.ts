import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const args = process.argv.slice(2);
const { values } = parseArgs({
  args,
  options: { profile: { type: 'string', short: 'e' } },
  // EAS owns validation of the remaining build arguments.
  strict: false,
  allowPositionals: true,
});

const result = spawnSync(
  'eas',
  [
    'build',
    '--local',
    ...(values.profile === undefined ? ['--profile', 'development'] : []),
    ...args,
  ],
  {
    stdio: 'inherit',
    // The package script loads local env files before EAS creates its build archive.
    env: process.env,
  },
);

if (result.error) {
  console.error(
    'Could not start EAS CLI. Ensure eas-cli is installed and eas is available on PATH.',
  );
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}
