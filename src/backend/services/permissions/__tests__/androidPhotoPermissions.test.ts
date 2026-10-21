import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ExpoConfig } from 'expo/config';
import { AndroidConfig } from 'expo/config-plugins';

const config: ExpoConfig = JSON.parse(
  readFileSync(join(__dirname, '../../../../../app.json'), 'utf8'),
).expo;

test('blocks library read permissions contributed by photo dependencies while retaining legacy saving', async () => {
  const manifests = await Promise.all(
    ['expo-image-picker', 'expo-media-library'].map((name) =>
      AndroidConfig.Manifest.readAndroidManifestAsync(
        join(
          dirname(require.resolve(`${name}/package.json`)),
          'android/src/main/AndroidManifest.xml',
        ),
      ),
    ),
  );
  const manifest = manifests[0];
  manifest.manifest['uses-permission'] = manifests.flatMap(
    (entry) => entry.manifest['uses-permission'] ?? [],
  );
  AndroidConfig.Permissions.setAndroidPermissions(config, manifest);
  AndroidConfig.Permissions.addBlockedPermissions(
    manifest,
    config.android?.blockedPermissions ?? [],
  );

  const permissions = manifest.manifest['uses-permission'] ?? [];
  for (const name of [
    'READ_EXTERNAL_STORAGE',
    'READ_MEDIA_IMAGES',
    'READ_MEDIA_VISUAL_USER_SELECTED',
  ]) {
    expect(
      permissions.filter((entry) => entry.$['android:name'] === `android.permission.${name}`),
    ).toEqual([{ $: { 'android:name': `android.permission.${name}`, 'tools:node': 'remove' } }]);
  }
  expect(permissions).toContainEqual({
    $: {
      'android:name': 'android.permission.WRITE_EXTERNAL_STORAGE',
      'android:maxSdkVersion': '32',
    },
  });
});
