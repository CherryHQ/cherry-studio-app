export type DevicePermission = 'calendar' | 'camera' | 'location' | 'photos' | 'reminders';
export type DevicePermissionScope =
  | 'calendar.read'
  | 'calendar.write'
  | 'camera.read'
  | 'location.read'
  | 'photos.read'
  | 'photos.write'
  | 'reminders.read'
  | 'reminders.write';
export type SystemPermissionState =
  | 'denied'
  | 'granted'
  | 'limited'
  | 'undetermined'
  | 'unavailable'
  | 'error';

export type DevicePermissionStatus = {
  state: SystemPermissionState;
  canAskAgain: boolean;
  reason?: 'unsupported' | 'service-disabled';
  accuracy?: 'approximate' | 'precise';
};
export type PermissionStatuses = Partial<Record<DevicePermissionScope, DevicePermissionStatus>>;

export interface PermissionsModule {
  getStatuses(scopes: readonly DevicePermissionScope[]): Promise<PermissionStatuses>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  /** Best-effort iOS prompt preparation when supported; completion is not a permission grant. */
  requestLocalNetworkAccess(signal?: AbortSignal): Promise<void>;
  /** Cancellation skips queued and subsequent prompts; an open system sheet must still settle. */
  request(
    scopes: readonly DevicePermissionScope[],
    signal?: AbortSignal,
  ): Promise<PermissionStatuses>;
}

/** Availability for execution under the current OS permission. */
export function canUseDevicePermission(
  scope: DevicePermissionScope,
  status: DevicePermissionStatus | undefined,
): boolean {
  return status?.state === 'granted' || (scope === 'photos.read' && status?.state === 'limited');
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
  return (
    states.find((status) => status.state === 'error') ??
    states.find((status) => status.state === 'undetermined') ??
    states[0]
  );
}
