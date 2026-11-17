import { AndroidConfig } from 'expo/config-plugins';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withAppIcons = require('../withAppIcons');

let mockConfigureXcode: (config: unknown) => unknown;

jest.mock('expo/config-plugins', () => ({
  ...jest.requireActual('expo/config-plugins'),
  withAndroidManifest: (config: unknown, action: (value: unknown) => unknown) => action(config),
  withXcodeProject: (config: unknown, action: (value: unknown) => unknown) => {
    mockConfigureXcode = action;
    return config;
  },
  withDangerousMod: (config: unknown) => config,
}));

const deepLink = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
  data: [{ $: { 'android:scheme': 'cherrystudio-dev' } }],
};

function config() {
  return {
    modResults: {
      manifest: {
        application: [
          {
            $: { 'android:name': '.MainApplication' },
            activity: [
              {
                $: { 'android:name': '.MainActivity', 'android:exported': 'true' },
                'intent-filter': [
                  {
                    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                    category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                  },
                  deepLink,
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

test('two branded launchers share an enabled MainActivity and preserve authentication deep links', () => {
  const result = withAppIcons(config());
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result.modResults);
  expect(activity.$['android:enabled']).not.toBe('false');
  expect(activity['intent-filter']).toEqual([deepLink]);
  expect(app['activity-alias']).toEqual([
    expect.objectContaining({
      $: expect.objectContaining({
        'android:name': '.CommunityLauncher',
        'android:enabled': 'true',
        'android:targetActivity': '.MainActivity',
      }),
    }),
    expect.objectContaining({
      $: expect.objectContaining({
        'android:name': '.EnterpriseLauncher',
        'android:enabled': 'false',
        'android:icon': '@mipmap/ic_launcher_enterprise',
        'android:targetActivity': '.MainActivity',
      }),
    }),
  ]);
});

test('repeated prebuilds do not duplicate launcher entries', () => {
  const first = withAppIcons(config());
  const second = withAppIcons(first);
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(second.modResults);
  expect(app['activity-alias']).toHaveLength(2);
});

test('iOS includes the alternate asset in the app without changing widget icon settings', () => {
  withAppIcons(config());
  const primary: Record<string, string> = {
    ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
    ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES: '"Existing"',
  };
  const widget = { ASSETCATALOG_COMPILER_APPICON_NAME: 'WidgetIcon' };
  const mod = {
    modResults: {
      pbxXCBuildConfigurationSection: () => ({
        app: { buildSettings: primary },
        extension: { buildSettings: widget },
        app_comment: 'App',
      }),
    },
  };
  mockConfigureXcode(mod);
  mockConfigureXcode(mod);
  expect(primary.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES).toBe('"Existing Enterprise"');
  expect(widget).toEqual({ ASSETCATALOG_COMPILER_APPICON_NAME: 'WidgetIcon' });
});

test('a domestic build removes alternate launchers and restores the original entry after a standard prebuild', () => {
  const result = withAppIcons(withAppIcons(config()), { androidEnabled: false });
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result.modResults);
  expect(app['activity-alias']).toEqual([]);
  expect(activity['intent-filter']).toContainEqual(deepLink);
  expect(
    activity['intent-filter']?.filter((filter) =>
      filter.category?.some(
        (item) => item.$['android:name'] === 'android.intent.category.LAUNCHER',
      ),
    ),
  ).toHaveLength(1);
});
