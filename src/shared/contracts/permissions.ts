export type DevicePermission = 'calendar' | 'health' | 'location' | 'reminders';
export type DevicePermissionAccess = 'read' | 'write';
export type DevicePermissionScope =
  | 'calendar.read'
  | 'calendar.write'
  | 'health.read'
  | 'location.read'
  | 'reminders.read'
  | 'reminders.write';
export type SystemPermissionState = 'denied' | 'granted' | 'undetermined' | 'unavailable';
export type PermissionStatuses = Partial<Record<DevicePermissionScope, SystemPermissionState>>;

export interface PermissionsModule {
  getStatuses(scopes: readonly DevicePermissionScope[]): Promise<PermissionStatuses>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  request(scope: DevicePermissionScope): Promise<SystemPermissionState>;
}
