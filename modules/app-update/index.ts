import { requireOptionalNativeModule } from 'expo';

export type NativeAppUpdate = {
  isApkInstallationEnabled(): boolean;
  canInstallPackages(): boolean;
  installApk(): Promise<'opened' | 'permissionRequired' | 'invalidPackage'>;
  checkPlayUpdate(): Promise<{ available: boolean; versionCode: number }>;
};

export function getNativeAppUpdate(): NativeAppUpdate | null {
  return requireOptionalNativeModule<NativeAppUpdate>('AppUpdate');
}
