import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import type { DiagnosticWarning } from './types';

function collectValue<T>(warnings: Set<DiagnosticWarning>, read: () => T): T | undefined {
  try {
    return read();
  } catch {
    warnings.add('system_info_unavailable');
    return undefined;
  }
}

export function collectDiagnosticSystemInfo(warnings: Set<DiagnosticWarning>) {
  return {
    application: collectValue(warnings, () => ({
      isPackaged: !__DEV__,
      name: Constants.expoConfig?.name ?? 'Cherry Studio',
      version: Constants.expoConfig?.version ?? 'unknown',
    })),
    operatingSystem: {
      arch: collectValue(warnings, () => Device.supportedCpuArchitectures?.join(',') ?? 'unknown'),
      locale: collectValue(warnings, () => getLocales()[0]?.languageTag ?? 'unknown'),
      platform: Platform.OS,
      release: String(Platform.Version),
      timezone: collectValue(warnings, () => Intl.DateTimeFormat().resolvedOptions().timeZone),
    },
    runtime: {
      expo: Constants.expoConfig?.sdkVersion,
      reactNative: Platform.constants.reactNativeVersion,
      hermes: 'HermesInternal' in globalThis,
    },
  };
}
