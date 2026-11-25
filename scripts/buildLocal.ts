import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { prepareSherpaArchive } from './prepareSherpaArchive';

const requireFromProject = createRequire(resolve('package.json'));
const args = process.argv.slice(2);
const { values } = parseArgs({
  args,
  options: {
    profile: { type: 'string', short: 'e' },
    platform: { type: 'string', short: 'p' },
    help: { type: 'boolean', short: 'h' },
    'non-interactive': { type: 'boolean' },
    json: { type: 'boolean' },
  },
  // EAS owns validation of the remaining build arguments.
  strict: false,
  allowPositionals: true,
});

async function buildLocal() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Avoid a nested npx invocation inheriting npm exec's package-selection settings.
    EAS_LOCAL_BUILD_PLUGIN_PATH:
      process.env.EAS_LOCAL_BUILD_PLUGIN_PATH ??
      requireFromProject.resolve('eas-cli-local-build-plugin/bin/run'),
  };
  const isProduction =
    typeof values.profile === 'string' &&
    ['production', 'production-google-play', 'production-domestic-stores'].includes(values.profile);
  if (isProduction && !values.help) {
    let platform = values.platform;
    if (
      platform === undefined &&
      !values['non-interactive'] &&
      !values.json &&
      !requireFromProject('eas-cli/build/commandUtils/flags').isNonInteractiveByDefault()
    ) {
      const picker: typeof import('eas-cli/build/platform') =
        requireFromProject('eas-cli/build/platform');
      platform = await picker.selectPlatformAsync();
      args.push('--platform', platform);
    }
    if (platform === 'android') {
      env.SITEED_SHERPA_ONNX_ARCHIVE = await prepareSherpaArchive(process.cwd(), env);
    }
  }
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
      env,
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
}

buildLocal().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
