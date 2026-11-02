import { requireOptionalNativeModule } from 'expo';

import type { DomesticAppStore } from '../../src/shared/contracts/appUpdate';

export type NativeAppUpdate = {
  isApkInstallationEnabled(): boolean;
  canInstallPackages(): boolean;
  installApk(): Promise<'opened' | 'permissionRequired' | 'invalidPackage'>;
  checkPlayUpdate(): Promise<{ available: boolean; versionCode: number }>;
  getDomesticStoreInfo(): { preferred: DomesticAppStore | null; available: DomesticAppStore[] };
  openDomesticStore(store: DomesticAppStore): Promise<void>;
};

export function getNativeAppUpdate(): NativeAppUpdate | null {
  return requireOptionalNativeModule<NativeAppUpdate>('AppUpdate');
}
