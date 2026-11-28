import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const linking = dirname(require.resolve('expo-linking/package.json'));

test('the installed Android callback consumer runs with the activity lifecycle on the main queue', () => {
  const config = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(config.expo.autolinking.android.buildFromSource).toContain('expo-linking');
  const source = readFileSync(
    join(linking, 'android/src/main/java/expo/modules/linking/ExpoLinkingModule.kt'),
    'utf8',
  );
  expect(source).toMatch(
    /AsyncFunction\("consumeURL"\) \{ expected: String ->\s*consumeURL\(appContext.currentActivity\?\.intent, expected\)\s*\}\.runOnQueue\(Queues.MAIN\)/,
  );
});

test('the installed Apple callback consumer compares and retires the app delegate URL on main', () => {
  const source = readFileSync(join(linking, 'ios/ExpoLinkingModule.swift'), 'utf8');
  expect(source).toMatch(
    /AsyncFunction\("consumeURL"\) \{ \(expected: String\) in\s*if registry.initialURL\?\.absoluteString == expected \{\s*registry.initialURL = nil\s*\}\s*\}\.runOnQueue\(\.main\)/,
  );
});
