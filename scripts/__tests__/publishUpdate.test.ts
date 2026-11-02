import { readFileSync } from 'node:fs';

import {
  assertPublishedRuntime,
  assertReceivingBuilds,
  EAS_CLI_VERSION,
  resolveTarget,
  updateArgs,
} from '../publishUpdate';

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));

test.each([
  ['preview', 'preview', 'preview', undefined, false, { PROFILE: 'preview' }],
  [
    'apk',
    'production-apk',
    'production',
    'android',
    true,
    { PROFILE: 'production', APK_UPDATES_ENABLED: 'true' },
  ],
  [
    'google-play',
    'production-google-play',
    'production',
    'android',
    true,
    { PROFILE: 'production', ANDROID_COMPRESS_NATIVE_LIBS: 'false', APK_UPDATES_ENABLED: 'false' },
  ],
  ['ios', 'production-ios', 'production', 'ios', true, { PROFILE: 'production' }],
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

test('pins the same EAS CLI as the release workflows', () => {
  for (const workflow of ['android-release', 'google-play-release', 'ios-release'])
    expect(readFileSync(`.github/workflows/${workflow}.yml`, 'utf8')).toContain(
      `EAS_CLI_VERSION: ${EAS_CLI_VERSION}\n`,
    );
});

test('the OTA workflow offers exactly the release targets', () => {
  const workflow = readFileSync('.github/workflows/ota-update.yml', 'utf8');
  expect(workflow).toContain('options: [all, apk, google-play, ios]');
  expect(workflow).toContain('targets=\'["apk","google-play","ios"]\'');
  for (const name of ['apk', 'google-play', 'ios'])
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
