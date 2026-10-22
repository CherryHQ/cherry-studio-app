import type { AppUpdateChannel } from '@/shared/contracts/appUpdate';

export function resolveAppUpdateChannel(
  platform: string,
  nativeChannel: string | null,
  developmentApk: boolean,
): AppUpdateChannel | null {
  if (platform === 'android') {
    if (nativeChannel === 'production-apk' || (nativeChannel === null && developmentApk))
      return 'apk';
    if (nativeChannel === 'production-google-play') return 'google-play';
  }
  if (platform === 'ios' && nativeChannel === 'production-ios') return 'app-store';
  return null;
}
