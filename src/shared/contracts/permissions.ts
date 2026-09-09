export const HEALTH_DATA_TYPES = [
  'steps',
  'activeEnergy',
  'distance',
  'heartRate',
  'restingHeartRate',
  'hrv',
  'sleep',
  'workouts',
] as const;
export type HealthDataType = (typeof HEALTH_DATA_TYPES)[number];
export type HealthPermissionScope = `health.${HealthDataType}.read`;
export const healthPermissionScope = (type: HealthDataType): HealthPermissionScope =>
  `health.${type}.read`;
export const HEALTH_PERMISSION_SCOPES = HEALTH_DATA_TYPES.map(healthPermissionScope);

export type DevicePermission =
  | 'calendar'
  | 'camera'
  | 'health'
  | 'location'
  | 'photos'
  | 'reminders';
export type DevicePermissionScope =
  | 'calendar.read'
  | 'calendar.write'
  | 'camera.read'
  | HealthPermissionScope
  | 'location.read'
  | 'photos.read'
  | 'photos.write'
  | 'reminders.read'
  | 'reminders.write';
export type SystemPermissionState =
  | 'denied'
  | 'granted'
  | 'limited'
  /** HealthKit exposes whether it has asked, never whether read access was granted. */
  | 'requested'
  | 'undetermined'
  | 'unavailable'
  | 'error';

export type DevicePermissionStatus = {
  state: SystemPermissionState;
  canAskAgain: boolean;
  reason?: 'unsupported' | 'install-required' | 'service-disabled' | 'native-unavailable';
  accuracy?: 'approximate' | 'precise';
};
export type PermissionStatuses = Partial<Record<DevicePermissionScope, DevicePermissionStatus>>;

export interface PermissionsModule {
  getStatuses(scopes: readonly DevicePermissionScope[]): Promise<PermissionStatuses>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  request(scopes: readonly DevicePermissionScope[]): Promise<PermissionStatuses>;
}

/** Availability for execution, not a claim that HealthKit disclosed its read grants. */
export function canUseDevicePermission(
  scope: DevicePermissionScope,
  status: DevicePermissionStatus | undefined,
): boolean {
  return (
    status?.state === 'granted' ||
    (scope === 'photos.read' && status?.state === 'limited') ||
    (scope.startsWith('health.') && status?.state === 'requested')
  );
}

export function canRequestDevicePermission(status: DevicePermissionStatus | undefined): boolean {
  return (
    status?.canAskAgain === true && (status.state === 'undetermined' || status.state === 'denied')
  );
}

export function summarizeDevicePermissions(
  scopes: readonly DevicePermissionScope[],
  statuses: PermissionStatuses,
): DevicePermissionStatus | undefined {
  const values = scopes.map((scope) => statuses[scope]);
  if (!values.length || values.some((value) => value === undefined)) return undefined;
  const states = values as DevicePermissionStatus[];
  if (states.every((status) => status.state === 'granted')) return states[0];
  if (states.some((status) => status.state === 'granted'))
    return { state: 'limited', canAskAgain: false };
  if (states.some((status) => status.state === 'requested'))
    return { state: 'requested', canAskAgain: false };
  return (
    states.find((status) => status.state === 'error') ??
    states.find((status) => status.state === 'undetermined') ??
    states[0]
  );
}
