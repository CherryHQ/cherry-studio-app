import type { AndroidConfig } from 'expo/config-plugins';

type NativeConfig = {
  infoPlist: { LSApplicationQueriesSchemes?: string[] };
  androidManifest: AndroidConfig.Manifest.AndroidManifest;
};

jest.mock('expo/config-plugins', () => ({
  withInfoPlist: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['infoPlist'] }) => unknown,
  ) => {
    action({ modResults: config.infoPlist });
    return config;
  },
  withAndroidManifest: (
    config: NativeConfig,
    action: (mod: { modResults: NativeConfig['androidManifest'] }) => unknown,
  ) => {
    action({ modResults: config.androidManifest });
    return config;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withUuRemote = require('../withUuRemote') as (config: NativeConfig) => NativeConfig;

const uuIntent = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  data: [{ $: { 'android:scheme': 'uuremote', 'android:host': 'external' } }],
};

function nativeConfig(
  queries: AndroidConfig.Manifest.AndroidManifest['manifest']['queries'] = [],
): NativeConfig {
  return {
    infoPlist: { LSApplicationQueriesSchemes: ['other-app'] },
    androidManifest: {
      manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, queries },
    },
  };
}

test('declares the full UU entry and preserves iOS visibility across repeated application', () => {
  const config = withUuRemote(withUuRemote(nativeConfig()));
  expect(config.androidManifest.manifest.queries).toEqual([{ intent: [uuIntent] }]);
  expect(config.infoPlist.LSApplicationQueriesSchemes).toEqual(['other-app', 'uuremote']);
});

test.each([undefined, 'other-host'])(
  'adds the required host when an existing UU query has host %s',
  (host) => {
    const existing = {
      intent: [
        {
          action: uuIntent.action,
          data: [{ $: { 'android:scheme': 'uuremote', 'android:host': host } }],
        },
      ],
    };
    const unrelated = { package: [{ $: { 'android:name': 'com.example.other' } }] };
    const config = withUuRemote(withUuRemote(nativeConfig([existing, unrelated])));
    expect(config.androidManifest.manifest.queries).toEqual([
      existing,
      unrelated,
      { intent: [uuIntent] },
    ]);
  },
);

test('reuses an existing UU query with separate scheme and host data elements', () => {
  const existing = {
    intent: [
      {
        action: uuIntent.action,
        data: [{ $: { 'android:scheme': 'uuremote' } }, { $: { 'android:host': 'external' } }],
      },
    ],
  };
  const config = withUuRemote(nativeConfig([existing]));
  expect(config.androidManifest.manifest.queries).toEqual([existing]);
});
