import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import appPackage from '../../../package.json';
import services from '../../../src/frontend/appShell/observability/reportingServices.json';

// Upgrade guards for app-owned native patches, not substitutes for native/device acceptance.
describe('production binary reporting gates', () => {
  const workspace = readFileSync(join(__dirname, '../../../pnpm-workspace.yaml'), 'utf8');

  test.each([
    {
      name: 'expo-observe',
      version: '57.0.20',
      flag: services.observe.nativeFlag,
      ios: 'ios/Observability.swift',
      android: 'android/src/main/java/expo/modules/observe/ObservabilityManager.kt',
    },
    {
      name: 'expo-insights',
      version: '57.0.18',
      flag: services.insights.nativeFlag,
      ios: 'ios/InsightsModule.swift',
      android: 'android/src/main/java/expo/modules/insights/ExpoInsightsModule.kt',
    },
  ] as const)('$name retains its installed native gate and source-build configuration', (entry) => {
    const root = dirname(require.resolve(`${entry.name}/package.json`));
    const installed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(installed.version).toBe(entry.version);
    expect(appPackage.dependencies[entry.name]).toBe(entry.version);
    expect(appPackage.expo.autolinking.android.buildFromSource).toContain(entry.name);
    expect(workspace).toContain(
      `${entry.name}@${entry.version}: patches/${entry.name}@${entry.version}.patch`,
    );

    const ios = readFileSync(join(root, entry.ios), 'utf8');
    const android = readFileSync(join(root, entry.android), 'utf8');
    expect(ios).toContain(
      `Bundle.main.object(forInfoDictionaryKey: "${entry.flag}") as? Bool == true`,
    );
    expect(ios).toContain('guard !EXAppDefines.APP_DEBUG');
    expect(android).toContain(`info.metaData?.getBoolean("${entry.flag}") == true`);
    expect(android).toContain('info.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0');
    expect(android).toContain('.getOrDefault(false)');

    if (entry.name === 'expo-observe') {
      expect(android).toContain('return isReportingAllowed && dispatchingEnabled');
      const worker = readFileSync(
        join(root, 'android/src/main/java/expo/modules/observe/ObservabilityBackgroundWorker.kt'),
        'utf8',
      );
      expect(worker).toContain('BaseObservabilityManager(');
    } else {
      expect(android).toContain('if (!allowed) return');
    }
  });

  test('Sentry configuration from JS remains constrained by the installed binary', () => {
    const ios = readFileSync(join(__dirname, '../ios/CrashReportingModule.swift'), 'utf8');
    const android = readFileSync(
      join(
        __dirname,
        '../android/src/main/java/expo/modules/crashreporting/CrashReportingModule.kt',
      ),
      'utf8',
    );
    expect(ios).toContain('canCapture = isCrashReportingAllowed && isProduction && !dsn.isEmpty');
    expect(android).toContain('applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0');
    expect(android).toContain(`metadata?.getBoolean("${services.sentry.nativeFlag}") == true`);
  });
});
