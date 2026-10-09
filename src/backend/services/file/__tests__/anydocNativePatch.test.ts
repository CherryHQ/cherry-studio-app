import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const anydocGradle = readFileSync(
  join(dirname(require.resolve('react-native-anydoc/package.json')), 'android/build.gradle'),
  'utf8',
);
const reactNativeVersions = readFileSync(
  join(dirname(require.resolve('react-native/package.json')), 'gradle/libs.versions.toml'),
  'utf8',
);

// Upgrade guard for the patched AnyDoc Gradle build. A dynamic fbjni version resolves to
// the newest release, wins Gradle conflict resolution over React Native's own fbjni, and
// the app then fails at launch with `couldn't find DSO to load: libfbjni.so`.
test('AnyDoc links the fbjni release React Native declares', () => {
  const reactNativeFbjni = /^fbjni = "([^"]+)"$/m.exec(reactNativeVersions)?.[1];
  const anydocFbjni = /"com\.facebook\.fbjni:fbjni:([^"]+)"/.exec(anydocGradle)?.[1];

  expect(reactNativeFbjni).toBeDefined();
  expect(anydocFbjni).toBe(reactNativeFbjni);
});
