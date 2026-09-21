import { requireOptionalNativeModule } from 'expo';

import type { SystemIntegrationNativeModule } from './types';

export function getSystemIntegration(): SystemIntegrationNativeModule | null {
  return requireOptionalNativeModule<SystemIntegrationNativeModule>('SystemIntegration');
}

export type { NativeSystemEntry, SystemIntegrationNativeModule } from './types';
export { nativeSystemEntrySchema } from './entrySchema';
