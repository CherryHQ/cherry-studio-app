import { requireOptionalNativeModule } from 'expo';

import type { DevicePermissionStatus, HealthDataType } from '@/shared/contracts/permissions';

export type HealthAccessModule = {
  getAvailability(): Promise<'available' | 'unsupported'>;
  getStatuses(
    types: readonly HealthDataType[],
  ): Promise<Partial<Record<HealthDataType, DevicePermissionStatus>>>;
  request(
    types: readonly HealthDataType[],
  ): Promise<Partial<Record<HealthDataType, DevicePermissionStatus>>>;
};

export function getHealthAccess(): HealthAccessModule | null {
  return requireOptionalNativeModule<HealthAccessModule>('HealthAccess');
}
