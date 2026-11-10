import { AndroidConfig } from 'expo/config-plugins';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withAppUpdates = require('../withAppUpdates');

jest.mock('expo/config-plugins', () => ({
  ...jest.requireActual('expo/config-plugins'),
  withGradleProperties: (config: Record<string, unknown>, action: (value: unknown) => unknown) => {
    const mod = { modResults: config.gradleProperties ?? [] };
    action(mod);
    return { ...config, gradleProperties: mod.modResults };
  },
  withProjectBuildGradle: (
    config: Record<string, unknown>,
    action: (value: unknown) => unknown,
  ) => {
    const mod = { modResults: { contents: config.gradleContents ?? 'allprojects {}' } };
    action(mod);
    return { ...config, gradleContents: mod.modResults.contents };
  },
  withAndroidManifest: (config: unknown, action: (value: unknown) => unknown) => action(config),
}));

const permission = 'android.permission.REQUEST_INSTALL_PACKAGES';
function config() {
  return {
    android: { permissions: [permission, 'android.permission.CAMERA'] },
    modResults: {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [
          { $: { 'android:name': permission } },
          { $: { 'android:name': 'android.permission.CAMERA' } },
        ],
        application: [{ $: { 'android:name': '.MainApplication' } }],
      },
    },
  };
}

test('store builds remove an existing installation permission, including library merges', () => {
  const result = withAppUpdates(config(), { apkUpdatesEnabled: false });
  expect(result.modResults.manifest['uses-permission']).toContainEqual({
    $: { 'android:name': permission, 'tools:node': 'remove' },
  });
  expect(result.android.permissions).not.toContain(permission);
  expect(result.android.permissions).toContain('android.permission.CAMERA');
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
  expect(application['meta-data']).toContainEqual({
    $: { 'android:name': 'expo.modules.appupdate.APK_UPDATES_ENABLED', 'android:value': 'false' },
  });
});

test('switching the same generated manifest to APK permits installation without a stale removal marker', () => {
  const store = withAppUpdates(config(), { apkUpdatesEnabled: false });
  const apk = withAppUpdates(store, { apkUpdatesEnabled: true });
  expect(
    apk.modResults.manifest['uses-permission'].filter(
      (item: { $: Record<string, string> }) => item.$['android:name'] === permission,
    ),
  ).toEqual([{ $: { 'android:name': permission } }]);
  expect(apk.android.blockedPermissions).not.toContain(permission);
});

test('vendor archives resolve from a stable local repository without duplicating prebuild entries', () => {
  const first = withAppUpdates(config(), { apkUpdatesEnabled: false, domesticStoresEnabled: true });
  const second = withAppUpdates(first, { apkUpdatesEnabled: false, domesticStoresEnabled: true });
  expect(second.gradleContents).toBe(first.gradleContents);
  expect(second.gradleContents).toContain(
    'flatDir { dirs "$rootDir/../modules/app-update/android/libs" }',
  );
  expect(second.gradleProperties).toEqual([
    { type: 'property', key: 'cherry.appUpdate.domesticStoresEnabled', value: 'true' },
  ]);
});

test('non-domestic builds exclude vendor resolution and retire an earlier domestic prebuild', () => {
  const domestic = withAppUpdates(config(), {
    apkUpdatesEnabled: false,
    domesticStoresEnabled: true,
  });
  const standard = withAppUpdates(domestic, { apkUpdatesEnabled: false });
  expect(standard.gradleContents).not.toContain('app-update/android/libs');
  expect(standard.gradleProperties).toEqual([
    { type: 'property', key: 'cherry.appUpdate.domesticStoresEnabled', value: 'false' },
  ]);
});
