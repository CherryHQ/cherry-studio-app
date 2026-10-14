import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

// Matches EAS_CLI_VERSION in the release workflows; update them together.
export const EAS_CLI_VERSION = '24.4.2';

type PlatformSettings = { channel?: string; env?: Record<string, string> };
type BuildProfile = PlatformSettings & {
  extends?: string;
  environment?: string;
  android?: PlatformSettings;
  ios?: PlatformSettings;
};
type EasConfig = { build: Record<string, BuildProfile> };
type EasBuild = { appVersion?: string; appBuildVersion?: string };
type EasUpdate = { group: string; runtimeVersion: string };

/**
 * Release targets ship packages built by the tag release workflow, so EAS records their runtimes
 * and only the OTA Update workflow publishes to them. Preview packages are built locally.
 */
const TARGETS: Record<string, { profile: string; platform?: 'android' | 'ios'; release?: true }> = {
  preview: { profile: 'preview' },
  apk: { profile: 'production', platform: 'android', release: true },
  'google-play': { profile: 'production-google-play', platform: 'android', release: true },
  ios: { profile: 'production', platform: 'ios', release: true },
};
const FIXED_OPTIONS = new Set(['--channel', '--branch', '--environment', '--input-dir', '--json']);
const SOURCE_MAP_ATTEMPTS = 3;

function resolveProfile(build: EasConfig['build'], name: string): BuildProfile {
  const profile = build[name];
  if (!profile) throw new Error(`Unknown build profile: ${name}`);
  const base = profile.extends ? resolveProfile(build, profile.extends) : {};
  const merge = (key: 'android' | 'ios') => ({
    ...base[key],
    ...profile[key],
    env: { ...base[key]?.env, ...profile[key]?.env },
  });
  return {
    ...base,
    ...profile,
    env: { ...base.env, ...profile.env },
    android: merge('android'),
    ios: merge('ios'),
  };
}

/**
 * Runtime fingerprints hash the evaluated app config, so a target reuses the exact build profile
 * env and channel from `eas.json` instead of a hand-maintained copy.
 */
export function resolveTarget(eas: EasConfig, name: string) {
  const selected = TARGETS[name];
  if (!selected)
    throw new Error(`Unknown update target: ${name}. Expected ${Object.keys(TARGETS).join(', ')}.`);
  const profile = resolveProfile(eas.build, selected.profile);
  const platform = selected.platform ? profile[selected.platform] : undefined;
  const channel = platform?.channel ?? profile.channel;
  if (!channel || !profile.environment)
    throw new Error(`Build profile ${selected.profile} has no channel or environment.`);
  return {
    name,
    platform: selected.platform,
    release: selected.release === true,
    channel,
    environment: profile.environment,
    env: { ...profile.env, ...platform?.env },
  };
}
type Target = ReturnType<typeof resolveTarget>;

export function updateArgs(target: Target, args: string[]) {
  const fixed = args.find(
    (arg) =>
      FIXED_OPTIONS.has(arg.split('=')[0]!) ||
      (target.platform && /^(-p|--platform)(=|$)/.test(arg)),
  );
  if (fixed) throw new Error(`${fixed} is fixed by the ${target.name} target.`);
  return [
    'update',
    '--channel',
    target.channel,
    '--environment',
    target.environment,
    ...(target.platform ? ['--platform', target.platform] : []),
    '--json',
    '--non-interactive',
    ...args,
  ];
}

/** Rejects a publish that no installed release build could receive. */
export function assertReceivingBuilds(target: Target, runtime: string, builds: EasBuild[]) {
  if (builds.length) return;
  throw new Error(
    `No finished ${target.platform} build on channel ${target.channel} has runtime ${runtime}. ` +
      'This change alters native compatibility and needs a native release (version tag).',
  );
}

/** Every published platform must use the runtime that passed the build check. */
export function assertPublishedRuntime(updates: EasUpdate[], runtime: string) {
  if (!updates.length || updates.some((update) => update.runtimeVersion !== runtime))
    throw new Error(`Published runtime differs from the checked runtime ${runtime}.`);
}

function run(command: string, args: string[], env: Record<string, string>, capture = false) {
  const result = spawnSync(command, args, {
    stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} exited with ${result.status}.`);
  return result.stdout ?? '';
}

const eas = (args: string[], env: Record<string, string>, capture = false) =>
  run('npx', ['--yes', `eas-cli@${EAS_CLI_VERSION}`, ...args], env, capture);

function report(markdown: string) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function check(target: Target) {
  // The same resolver `eas update` uses for the fingerprint runtime policy.
  const runtime = (
    JSON.parse(
      run(
        'node',
        [
          'node_modules/expo-updates/bin/cli.js',
          'runtimeversion:resolve',
          '--platform',
          target.platform!,
        ],
        target.env,
        true,
      ),
    ) as { runtimeVersion: string }
  ).runtimeVersion;
  const builds = JSON.parse(
    eas(
      [
        'build:list',
        '--platform',
        target.platform!,
        '--channel',
        target.channel,
        '--runtime-version',
        runtime,
        '--status',
        'finished',
        '--limit',
        '50',
        '--json',
        '--non-interactive',
      ],
      target.env,
      true,
    ),
  ) as EasBuild[];
  assertReceivingBuilds(target, runtime, builds);
  const versions = builds.map((build) => `${build.appVersion} (${build.appBuildVersion})`);
  report(`- \`${target.name}\` runtime \`${runtime}\` reaches builds ${versions.join(', ')}`);
  return runtime;
}

function uploadSourceMaps(target: Target) {
  for (let attempt = 1; ; attempt++) {
    try {
      eas(
        ['env:exec', target.environment, 'pnpm exec sentry-expo-upload-sourcemaps dist'],
        target.env,
      );
      return;
    } catch (error) {
      if (attempt === SOURCE_MAP_ATTEMPTS) throw error;
      console.warn(`Source map upload failed (attempt ${attempt}); retrying.`);
    }
  }
}

function publish(target: Target, args: string[]) {
  if (target.release && !process.env.GITHUB_ACTIONS)
    throw new Error('Release channels are published only by the OTA Update GitHub workflow.');
  const runtime = target.release ? check(target) : undefined;
  const updates = JSON.parse(eas(updateArgs(target, args), target.env, true)) as EasUpdate[];
  if (runtime) assertPublishedRuntime(updates, runtime);
  const groups = [...new Set(updates.map((update) => `\`${update.group}\``))];
  report(`- \`${target.name}\` published update group ${groups.join(', ')}`);
  // Preview packages do not report to Sentry; release exports must be symbolicated.
  if (target.release) {
    uploadSourceMaps(target);
    report(`- \`${target.name}\` source maps uploaded to Sentry`);
  }
}

if (basename(process.argv[1] ?? '') === 'publishUpdate.ts') {
  try {
    const [command, name = '', ...args] = process.argv.slice(2);
    const target = resolveTarget(JSON.parse(readFileSync('eas.json', 'utf8')) as EasConfig, name);
    if (command === 'check' && target.release) check(target);
    else if (command === 'publish') publish(target, args);
    else throw new Error('Usage: publishUpdate.ts check <apk|google-play|ios> | publish <target>');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
