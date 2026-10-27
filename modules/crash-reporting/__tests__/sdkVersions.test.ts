import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const sdkRoot = dirname(require.resolve('@sentry/react-native/package.json'));

test('iOS compiles against the Sentry Cocoa build that the React Native SDK links', () => {
  const podspec = readFileSync(join(__dirname, '../ios/CrashReporting.podspec'), 'utf8');

  // The version is read from RNSentry.podspec, so that assignment must keep its shape.
  expect(readFileSync(join(sdkRoot, 'RNSentry.podspec'), 'utf8')).toMatch(
    /sentry_cocoa_version = '[^']+'/,
  );
  expect(podspec).toContain("[/sentry_cocoa_version = '([^']+)'/, 1]");
  expect(podspec).toContain("s.dependency 'RNSentry'");
  expect(podspec).not.toContain("'Sentry/HybridSDK'");
});

test('Android depends on the sentry-android version bundled with the React Native SDK', () => {
  const androidVersion = readFileSync(join(sdkRoot, 'android/build.gradle'), 'utf8').match(
    /def sentryAndroidVersion = '([^']+)'/,
  )?.[1];

  expect(androidVersion).toBeDefined();
  expect(readFileSync(join(__dirname, '../android/build.gradle'), 'utf8')).toContain(
    `io.sentry:sentry-android:${androidVersion}'`,
  );
});
