import { withPlugins, type ExportedConfig } from 'expo/config-plugins';

import appConfig from '../../../app.json';

function voicePlugins(): ExportedConfig {
  const { expo } = appConfig;
  const entries = expo.plugins.filter(
    (plugin) =>
      Array.isArray(plugin) &&
      ['expo-camera', 'expo-image-picker', 'expo-audio'].includes(plugin[0] as string),
  ) as Parameters<typeof withPlugins>[1];
  return withPlugins(
    {
      name: expo.name,
      slug: expo.slug,
      _internal: { projectRoot: process.cwd() },
      android: { blockedPermissions: [...expo.android.blockedPermissions] },
    },
    entries,
  );
}

const request = {
  projectRoot: process.cwd(),
  platformProjectRoot: '/unused',
  introspect: true,
  ignoreExistingNativeFiles: true,
};

// Apply the installed plugins' in-memory mods; no prebuild, generated files or native tools.
test('the combined camera, picker and audio plugins retain Android microphone access without background services', async () => {
  expect(appConfig.expo.android.blockedPermissions).not.toContain(
    'android.permission.RECORD_AUDIO',
  );
  const config = voicePlugins();
  const result = await config.mods!.android!.manifest!({
    ...config,
    modRawConfig: config,
    modRequest: { ...request, platform: 'android', modName: 'manifest' },
    modResults: {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        queries: [],
        application: [{ $: { 'android:name': '.MainApplication' } }],
      },
    },
  });
  const permissions = result.modResults.manifest['uses-permission'];
  expect(permissions).toContainEqual({ $: { 'android:name': 'android.permission.RECORD_AUDIO' } });
  expect(permissions).not.toContainEqual({
    $: { 'android:name': 'android.permission.RECORD_AUDIO', 'tools:node': 'remove' },
  });
  expect(result.modResults.manifest.application?.[0].service ?? []).toEqual([]);
});

test('the combined plugins retain the voice microphone purpose on iOS without background audio', async () => {
  const config = voicePlugins();
  const result = await config.mods!.ios!.infoPlist!({
    ...config,
    modRawConfig: config,
    modRequest: { ...request, platform: 'ios', modName: 'infoPlist' },
    modResults: {},
  });
  expect(result.modResults.NSMicrophoneUsageDescription).toContain(
    'selected AI provider for transcription',
  );
  expect(result.modResults.UIBackgroundModes ?? []).not.toContain('audio');
});
