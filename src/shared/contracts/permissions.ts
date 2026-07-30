import type { PermissionMode, PermissionPreferenceKey } from '@/shared/domain/preferences';

export type DevicePermission = 'calendar' | 'health' | 'location' | 'reminders';
export type DevicePermissionAccess = 'read' | 'write';
export type SystemPermissionState = 'denied' | 'granted' | 'undetermined' | 'unavailable';
export type PermissionStatuses = Partial<Record<PermissionPreferenceKey, SystemPermissionState>>;

export type SetPermissionPolicyResult = {
  policy: PermissionMode;
  status: SystemPermissionState;
};

export interface PermissionsBackend {
  getStatuses(keys: readonly PermissionPreferenceKey[]): Promise<PermissionStatuses>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  recover(keys: readonly PermissionPreferenceKey[]): Promise<PermissionStatuses>;
  setPolicy(
    key: PermissionPreferenceKey,
    policy: PermissionMode,
  ): Promise<SetPermissionPolicyResult>;
}
