import { readFileSync } from 'node:fs';

import type { ConfigContext } from 'expo/config';

import configureApp from '../../app.config';
import appConfig from '../../app.json';
import {
  assertPublishedRuntime,
  assertReceivingBuilds,
  EAS_CLI_VERSION,
  resolveTarget,
  updateArgs,
} from '../publishUpdate';

jest.mock('tsx/cjs', () => ({}));

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));

test.each([
  ['preview', 'preview', 'preview', undefined, false, { PROFILE: 'preview' }],
  [
    'apk',
    'production-apk',
    'production',
    'android',
    true,
    {
      PROFILE: 'production',
      SENTRY_URL: 'https://sentry.io/',
      APK_UPDATES_ENABLED: 'true',
      DOMESTIC_STORES_ENABLED: 'false',
    },
  ],
  [
    'google-play',
    'production-google-play',
    'production',
    'android',
    true,
    {
      PROFILE: 'production',
      SENTRY_URL: 'https://sentry.io/',
      ANDROID_COMPRESS_NATIVE_LIBS: 'false',
      APK_UPDATES_ENABLED: 'false',
      DOMESTIC_STORES_ENABLED: 'false',
    },
  ],
  [
    'ios',
    'production-ios',
    'production',
    'ios',
    true,
    {
      PROFILE: 'production',
      SENTRY_URL: 'https://sentry.io/',
      DOMESTIC_STORES_ENABLED: 'false',
    },
  ],
  [
    'domestic-stores',
    'production-domestic-stores',
    'production',
    'android',
    true,
    {
      PROFILE: 'production',
      SENTRY_URL: 'https://sentry.io/',
      APK_UPDATES_ENABLED: 'false',
      DOMESTIC_STORES_ENABLED: 'true',
    },
  ],
])(
  '%s publishes with its build profile channel and env',
  (name, channel, environment, platform, release, env) => {
    const target = resolveTarget(eas, name);
    expect(target).toEqual({ name, channel, environment, platform, release, env });
    expect(updateArgs(target, ['--message', 'Fix'])).toEqual([
      'update',
      '--channel',
      channel,
      '--environment',
      environment,
      ...(platform ? ['--platform', platform] : []),
      '--json',
      '--non-interactive',
      '--message',
      'Fix',
    ]);
  },
);

test.each([
  ['preview', 'preview'],
  ['apk', 'production'],
  ['google-play', 'production-google-play'],
  ['domestic-stores', 'production-domestic-stores'],
  ['ios', 'production-ios-cloud'],
])('%s keeps native update configuration identical for build and OTA', (name, buildProfile) => {
  const originalEnv = process.env;
  const environment = { ...originalEnv };
  for (const key of [
    'EAS_BUILD_PROFILE',
    'APK_UPDATES_ENABLED',
    'DOMESTIC_STORES_ENABLED',
    'EXPO_PUBLIC_STORYBOOK_ENABLED',
  ]) {
    delete environment[key];
  }
  try {
    process.env = { ...environment, ...resolveTarget(eas, name).env };
    const context = { config: appConfig.expo } as unknown as ConfigContext;
    // Build submission and OTA both evaluate without the worker-only profile variable.
    const local = configureApp(context);
    process.env.EAS_BUILD_PROFILE = buildProfile;
    const worker = configureApp(context);

    expect(worker.plugins).toEqual(local.plugins);
    expect(local.plugins).toContainEqual([
      './scripts/withAppUpdates.js',
      { apkUpdatesEnabled: name === 'apk', domesticStoresEnabled: name === 'domestic-stores' },
    ]);
  } finally {
    process.env = originalEnv;
  }
});

test('pins the same EAS CLI as the release workflows', () => {
  for (const workflow of ['android-release', 'google-play-release', 'ios-release'])
    expect(readFileSync(`.github/workflows/${workflow}.yml`, 'utf8')).toContain(
      `EAS_CLI_VERSION: ${EAS_CLI_VERSION}\n`,
    );
});

test('the OTA workflow offers exactly the release targets', () => {
  const workflow = readFileSync('.github/workflows/ota-update.yml', 'utf8');
  expect(workflow).toContain('options: [all, apk, google-play, domestic-stores, ios]');
  expect(workflow).toContain('targets=\'["apk","google-play","domestic-stores","ios"]\'');
  for (const name of ['apk', 'google-play', 'domestic-stores', 'ios'])
    expect(resolveTarget(eas, name).release).toBe(true);
});

test.each([
  ['apk', ['--channel', 'preview']],
  ['apk', ['--environment=preview']],
  ['apk', ['--json']],
  ['ios', ['--platform', 'android']],
  ['google-play', ['-p', 'all']],
])('%s rejects overriding fixed publication settings: %j', (name, args) => {
  expect(() => updateArgs(resolveTarget(eas, name), args)).toThrow('is fixed');
});

test('rejects unknown targets', () => {
  expect(() => resolveTarget(eas, 'production')).toThrow('Unknown update target');
});

test('preview may select one platform', () => {
  expect(updateArgs(resolveTarget(eas, 'preview'), ['--platform', 'ios'])).toContain('ios');
});

test('requires a release build that can receive the runtime', () => {
  const target = resolveTarget(eas, 'apk');
  expect(() => assertReceivingBuilds(target, 'abc', [])).toThrow('needs a native release');
  expect(() =>
    assertReceivingBuilds(target, 'abc', [{ appVersion: '0.3.0', appBuildVersion: '120' }]),
  ).not.toThrow();
});

test('rejects a publication whose runtime differs from the checked one', () => {
  expect(() => assertPublishedRuntime([], 'abc')).toThrow();
  expect(() => assertPublishedRuntime([{ group: 'g', runtimeVersion: 'other' }], 'abc')).toThrow();
  expect(() =>
    assertPublishedRuntime([{ group: 'g', runtimeVersion: 'abc' }], 'abc'),
  ).not.toThrow();
});
