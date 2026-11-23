import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AndroidConfig } from 'expo/config-plugins';

type ManifestMod = { modResults: AndroidConfig.Manifest.AndroidManifest };

jest.mock('expo/config-plugins', () => ({
  ...jest.requireActual('expo/config-plugins'),
  withAndroidManifest: (config: ManifestMod, action: (mod: ManifestMod) => ManifestMod) =>
    action(config),
  withMainActivity: (config: ManifestMod) => config,
  withDangerousMod: (config: ManifestMod) => config,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withTabletOrientation = require('../withTabletOrientation') as (
  mod: ManifestMod,
) => ManifestMod;

const nativeSource = (packageName: string, file: string) =>
  readFileSync(join(dirname(require.resolve(`${packageName}/package.json`)), file), 'utf8');

// These guards check the Material dependency patch and installed version declaration.
// Android runtime behavior and Play Console results require separate native acceptance.
describe('Android Material compatibility patch', () => {
  test('retains the Screens patch registration and current lockfile hash', () => {
    const dependency = 'react-native-screens@4.30.1';
    const patchPath = `patches/${dependency}.patch`;
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test('uses the Material release with guarded system-bar calls in native sheet dialogs', () => {
    expect(nativeSource('react-native-screens', 'android/build.gradle')).toContain(
      "implementation 'com.google.android.material:material:1.14.0'",
    );
  });
});

test.each([undefined, 'true'] as const)(
  'declares portrait support optional when the prior requirement is %s',
  (required) => {
    const portrait = 'android.hardware.screen.portrait';
    const camera = {
      $: { 'android:name': 'android.hardware.camera', 'android:required': 'false' },
    } as const;
    const scanner = {
      $: {
        'android:name':
          'com.google.mlkit.vision.documentscanner.internal.GmsDocumentScanningDelegateActivity',
        'android:screenOrientation': 'portrait',
      },
    };
    const mod: ManifestMod = {
      modResults: {
        manifest: {
          $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
          'uses-feature': [
            { $: { ...camera.$ } },
            ...(required
              ? [{ $: { 'android:name': portrait, 'android:required': required } }]
              : []),
          ],
          application: [
            {
              $: { 'android:name': '.MainApplication' },
              activity: [{ $: { 'android:name': '.MainActivity' } }, { $: { ...scanner.$ } }],
            },
          ],
          queries: [],
        },
      },
    };

    const manifest = withTabletOrientation(withTabletOrientation(mod)).modResults.manifest;

    expect(manifest['uses-feature']).toEqual([
      camera,
      { $: { 'android:name': portrait, 'android:required': 'false' } },
    ]);
    expect(manifest.application?.[0]?.activity).toContainEqual(scanner);
  },
);
