import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AndroidConfig } from 'expo/config-plugins';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withAppIcons = require('../withAppIcons');

let mockConfigureXcode: (config: unknown) => unknown;
let mockConfigureMainActivity: (config: unknown) => unknown;
let mockRestoreManifest: ((mod: unknown) => Promise<unknown>) | undefined;

jest.mock('expo/config-plugins', () => ({
  ...jest.requireActual('expo/config-plugins'),
  withAndroidManifest: (config: unknown, action: (value: unknown) => unknown) => action(config),
  withMainActivity: (config: unknown, action: (value: unknown) => unknown) => {
    mockConfigureMainActivity = action;
    return config;
  },
  withXcodeProject: (config: unknown, action: (value: unknown) => unknown) => {
    mockConfigureXcode = action;
    return config;
  },
  withDangerousMod: (
    config: unknown,
    [platform, action]: [string, (mod: unknown) => Promise<unknown>],
  ) => {
    if (platform === 'android') mockRestoreManifest ??= action;
    return config;
  },
}));

const deepLink = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
  data: [{ $: { 'android:scheme': 'cherrystudio-dev' } }],
};

/** A non-clean prebuild: the restore mod rewrites the previous manifest before mods read it. */
async function prebuildAgain(
  previous: { modResults: AndroidConfig.Manifest.AndroidManifest },
  options?: { androidEnabled: boolean },
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'app-icons-'));
  const manifestPath = path.join(root, 'app/src/main/AndroidManifest.xml');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await AndroidConfig.Manifest.writeAndroidManifestAsync(manifestPath, previous.modResults);
  await mockRestoreManifest!({ modRequest: { platformProjectRoot: root } });
  const modResults = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
  await fs.rm(root, { recursive: true });
  return withAppIcons({ modResults }, options);
}

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

test('the default launcher keeps its shipped component name and both icons use an enabled host', () => {
  const result = withAppIcons(config());
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
  const activity = app.activity?.find((entry) => entry.$['android:name'] === '.MainActivityHost');
  expect(activity).toBeDefined();
  expect(activity?.['intent-filter']).toEqual([deepLink]);
  expect(app['activity-alias']).toEqual([
    expect.objectContaining({
      $: expect.objectContaining({
        'android:name': '.MainActivity',
        'android:enabled': 'true',
        'android:targetActivity': '.MainActivityHost',
      }),
    }),
    expect.objectContaining({
      $: expect.objectContaining({
        'android:name': '.EnterpriseLauncher',
        'android:enabled': 'false',
        'android:icon': '@mipmap/ic_launcher_enterprise',
        'android:targetActivity': '.MainActivityHost',
      }),
    }),
  ]);
});

test('repeated prebuilds do not duplicate launcher entries', async () => {
  const first = withAppIcons(config());
  const second = await prebuildAgain(first);
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(second.modResults);
  expect(app['activity-alias']).toHaveLength(2);
  expect(app.activity).toHaveLength(1);
  expect(app.activity?.[0]?.['intent-filter']).toEqual([deepLink]);
});

test('the generated host inherits the complete MainActivity implementation without duplication', () => {
  withAppIcons(config());
  const mod = {
    modResults: {
      language: 'kt',
      contents:
        'package example\nclass MainActivity : ReactActivity() {\n  fun initializeApp() {}\n}\n',
    },
  };
  mockConfigureMainActivity(mod);
  const first = mod.modResults.contents;
  mockConfigureMainActivity(mod);
  expect(mod.modResults.contents).toBe(first);
  expect(first).toContain('open class MainActivity : ReactActivity()');
  expect(first).toContain('fun initializeApp() {}');
  expect(first).toContain('class MainActivityHost : MainActivity()');
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

test('disabling switching keeps the launcher declarations an overwritten APK relies on', async () => {
  const standard = withAppIcons(config());
  const original = JSON.parse(JSON.stringify(standard.modResults));
  const result = await prebuildAgain(standard, { androidEnabled: false });
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
  expect(app['activity-alias']).toEqual(original.manifest.application[0]['activity-alias']);
  expect(app.activity).toEqual(original.manifest.application[0].activity);
  expect(app['meta-data']).toContainEqual({
    $: {
      'android:name': 'expo.modules.systemintegration.APP_ICON_SWITCHING_ENABLED',
      'android:value': 'false',
    },
  });
});
