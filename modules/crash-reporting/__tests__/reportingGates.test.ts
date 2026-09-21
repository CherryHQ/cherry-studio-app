import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import services from '../../../src/frontend/appShell/observability/reportingServices.json';

// The app-owned native gate cannot be enabled by JS in a non-production binary.
describe('production binary reporting gates', () => {
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
