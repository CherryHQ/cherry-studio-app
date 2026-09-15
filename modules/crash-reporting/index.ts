import { requireOptionalNativeModule } from 'expo';

export type CrashReportingStatus = { enabled: boolean; active: boolean };

export type CrashReportingModule = {
  configure(dsn: string, isProduction: boolean, consentVersion: string): CrashReportingStatus;
  getStatus(): CrashReportingStatus;
  setConsent(enabled: boolean): Promise<CrashReportingStatus>;
};

export function getCrashReporting(): CrashReportingModule | null {
  return requireOptionalNativeModule<CrashReportingModule>('CrashReporting');
}
