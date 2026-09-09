import { requireOptionalNativeModule } from 'expo';

import type { DevicePermissionStatus, HealthDataType } from '@/shared/contracts/permissions';

export type HealthAccessModule = {
  getAvailability(): Promise<'available' | 'unsupported' | 'install-required'>;
  getStatuses(
    types: readonly HealthDataType[],
  ): Promise<Partial<Record<HealthDataType, DevicePermissionStatus>>>;
  request(
    types: readonly HealthDataType[],
  ): Promise<Partial<Record<HealthDataType, DevicePermissionStatus>>>;
  openSettings(): Promise<void>;
};

export function getHealthAccess(): HealthAccessModule | null {
  return requireOptionalNativeModule<HealthAccessModule>('HealthAccess');
}
