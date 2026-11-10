import { requireOptionalNativeModule } from 'expo';

export type NativeDomesticStore = 'honor' | 'xiaomi' | 'oppo' | 'vivo';

export type NativeStoreUpdateResult =
  | { status: 'upToDate' }
  | { status: 'unavailable'; reason: string; vendorCode?: number | null }
  | {
      status: 'available';
      versionCode: number | null;
      versionName: string | null;
      notes: string | null;
    };

export type NativeAppUpdate = {
  isApkInstallationEnabled(): boolean;
  canInstallPackages(): boolean;
  installApk(): Promise<'opened' | 'permissionRequired' | 'invalidPackage'>;
  checkPlayUpdate(): Promise<{ available: boolean; versionCode: number }>;
  getDomesticStore(): NativeDomesticStore | null;
  checkDomesticStoreUpdate(
    id: string,
    store: Exclude<NativeDomesticStore, 'oppo'>,
  ): Promise<NativeStoreUpdateResult>;
  cancelDomesticStoreUpdate(id: string): Promise<void>;
  openDomesticStore(store: NativeDomesticStore): Promise<void>;
};

export function getNativeAppUpdate(): NativeAppUpdate | null {
  return requireOptionalNativeModule<NativeAppUpdate>('AppUpdate');
}
