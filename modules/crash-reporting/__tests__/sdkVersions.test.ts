import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

test('native dependencies match the versions bundled with the installed React Native SDK', () => {
  const sdkRoot = dirname(require.resolve('@sentry/react-native/package.json'));
  const cocoaVersion = readFileSync(join(sdkRoot, 'RNSentry.podspec'), 'utf8').match(
    /s\.dependency 'Sentry\/HybridSDK', '([^']+)'/,
  )?.[1];
  const androidVersion = readFileSync(join(sdkRoot, 'android/build.gradle'), 'utf8').match(
    /io\.sentry:sentry-android:([^']+)'/,
  )?.[1];

  expect(cocoaVersion).toBeDefined();
  expect(androidVersion).toBeDefined();
  expect(readFileSync(join(__dirname, '../ios/CrashReporting.podspec'), 'utf8')).toContain(
    `s.dependency 'Sentry/HybridSDK', '${cocoaVersion}'`,
  );
  expect(readFileSync(join(__dirname, '../android/build.gradle'), 'utf8')).toContain(
    `io.sentry:sentry-android:${androidVersion}'`,
  );
});
