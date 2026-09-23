import { requireOptionalNativeModule } from 'expo';

/**
 * Persistent application-resource roots that Expo's `Paths` does not expose.
 *
 * iOS `Paths.document` is the user-visible Documents directory; installed
 * Skill packages are application resources and belong under Application
 * Support. Android has no such split and uses the app's internal `filesDir`.
 */
export type ManagedStorageModule = {
  /** `file://` URI of the platform's persistent application-support root. */
  getApplicationSupportDirectory(): string;
};

export function getManagedStorage(): ManagedStorageModule | null {
  return requireOptionalNativeModule<ManagedStorageModule>('ManagedStorage');
}
