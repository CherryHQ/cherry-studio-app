import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const nativeSource = (packageName: string, file: string) =>
  readFileSync(join(dirname(require.resolve(`${packageName}/package.json`)), file), 'utf8');
const statusBar = nativeSource(
  'react-native',
  'ReactAndroid/src/main/java/com/facebook/react/modules/statusbar/StatusBarModule.kt',
);
const windowUtil = nativeSource(
  'react-native',
  'ReactAndroid/src/main/java/com/facebook/react/views/view/WindowUtil.kt',
);
const android15Guard =
  /Build\.VERSION\.SDK_INT >= AndroidVersion\.VERSION_CODE_VANILLA_ICE_CREAM \|\|\s+isEdgeToEdgeFeatureFlagOn/;

// These guards check delivery and version branches in the installed native sources.
// Android runtime behavior and Play Console results require separate native acceptance.
describe('Android window compatibility patches', () => {
  test.each(['react-native@0.86.3', 'react-native-screens@4.26.2'])(
    '%s retains its registered patch and current lockfile hash',
    (dependency) => {
      const patchPath = `patches/${dependency}.patch`;
      const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');
      expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
      expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
    },
  );

  test('enables compilation of the patched React Native Android sources', () => {
    const { expo } = JSON.parse(readFileSync('app.json', 'utf8')) as {
      expo: {
        plugins: (string | [string, { android?: { buildReactNativeFromSource?: boolean } }])[];
      };
    };
    const buildProperties = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    expect(
      Array.isArray(buildProperties) && buildProperties[1].android?.buildReactNativeFromSource,
    ).toBe(true);
  });

  test('avoids reading the deprecated status-bar color on Android 15+', () => {
    const constants = statusBar
      .split('override fun getTypedExportedConstants()')[1]
      ?.split('override fun setColor')[0];
    expect(constants).toMatch(
      /if \(Build\.VERSION\.SDK_INT >= AndroidVersion\.VERSION_CODE_VANILLA_ICE_CREAM\) \{\s*(?:\/\/[^\n]*\n\s*)?"transparent"\s*\} else \{\s*currentActivity\?\.window\?\.statusBarColor/,
    );
  });

  test.each([
    ['setColor', 'setTranslucent'],
    ['setTranslucent', 'setHidden'],
  ])('rejects legacy %s before scheduling window changes on Android 15+', (method, next) => {
    const body = statusBar.split(`override fun ${method}(`)[1]?.split(`override fun ${next}(`)[0];
    const guard = body?.match(android15Guard);
    expect(guard).toBeTruthy();
    expect(body?.slice(guard?.index).split('UiThreadUtil.runOnUiThread')[0]).toMatch(/return\s*\}/);
  });

  test.each([
    ['statusBarHide', 'statusBarShow', 'hide'],
    ['statusBarShow', 'enableEdgeToEdge', 'show'],
  ])('uses inset controllers for %s on Android 15+', (method, next, operation) => {
    const body = windowUtil.split(`fun Window.${method}()`)[1]?.split(`fun Window.${next}()`)[0];
    expect(body).toMatch(android15Guard);
    expect(body).toContain('WindowInsetsControllerCompat(this, decorView)');
    expect(body).toContain(`${operation}(WindowInsetsCompat.Type.statusBars())`);
  });

  test('keeps legacy colors below Android 15 and preserves navigation contrast handling', () => {
    for (const color of ['statusBarColor', 'navigationBarColor']) {
      expect(windowUtil).toMatch(
        new RegExp(
          `if \\(Build\\.VERSION\\.SDK_INT < AndroidVersion\\.VERSION_CODE_VANILLA_ICE_CREAM\\) \\{\\s*${color} = Color\\.TRANSPARENT\\s*\\}`,
        ),
      );
    }
    expect(windowUtil).toContain('isNavigationBarContrastEnforced = enforceNavigationBarContrast');
    expect(windowUtil).toContain('LightNavigationBarColor else DarkNavigationBarColor');
  });

  test('uses the Material release with guarded system-bar calls in native sheet dialogs', () => {
    expect(nativeSource('react-native-screens', 'android/build.gradle')).toContain(
      "implementation 'com.google.android.material:material:1.14.0'",
    );
  });
});
