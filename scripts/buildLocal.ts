import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const requireFromProject = createRequire(resolve('package.json'));
const args = process.argv.slice(2);
const { values } = parseArgs({
  args,
  options: { profile: { type: 'string', short: 'e' } },
  // EAS owns validation of the remaining build arguments.
  strict: false,
  allowPositionals: true,
});

const result = spawnSync(
  process.execPath,
  [
    requireFromProject.resolve('eas-cli/bin/run'),
    'build',
    '--local',
    ...(values.profile === undefined ? ['--profile', 'development'] : []),
    ...args,
  ],
  {
    stdio: 'inherit',
    // The package script loads local env files before EAS creates its build archive.
    env: {
      ...process.env,
      // Avoid a nested npx invocation inheriting npm exec's package-selection settings.
      EAS_LOCAL_BUILD_PLUGIN_PATH:
        process.env.EAS_LOCAL_BUILD_PLUGIN_PATH ??
        requireFromProject.resolve('eas-cli-local-build-plugin/bin/run'),
    },
  },
);

if (result.error) {
  console.error(
    'Could not start the project EAS CLI. Run pnpm install with the repository toolchain.',
  );
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}
