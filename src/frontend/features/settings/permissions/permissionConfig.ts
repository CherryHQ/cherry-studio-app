import {
  canRequestDevicePermission,
  type DevicePermission,
  type DevicePermissionScope,
  type DevicePermissionStatus,
  HEALTH_PERMISSION_SCOPES,
  type PermissionStatuses,
  summarizeDevicePermissions,
} from '@/shared/contracts';

export const permissionKinds = [
  'location',
  'calendar',
  'reminders',
  'health',
  'camera',
  'photos',
] as const;
export type PermissionKind = (typeof permissionKinds)[number];
export type PermissionAction = 'open-settings' | 'request' | 'retry';

export const permissionConfig: Record<
  PermissionKind,
  {
    permission: DevicePermission;
    scopes: readonly DevicePermissionScope[];
  }
> = {
  calendar: { permission: 'calendar', scopes: ['calendar.read', 'calendar.write'] },
  health: { permission: 'health', scopes: HEALTH_PERMISSION_SCOPES },
  location: { permission: 'location', scopes: ['location.read'] },
  reminders: { permission: 'reminders', scopes: ['reminders.read', 'reminders.write'] },
  camera: { permission: 'camera', scopes: ['camera.read'] },
  photos: { permission: 'photos', scopes: ['photos.read', 'photos.write'] },
};

export function getPermissionStatus(
  kind: PermissionKind,
  statuses: PermissionStatuses,
): DevicePermissionStatus | undefined {
  const values = permissionConfig[kind].scopes.map((scope) => statuses[scope]);
  if (values.some((value) => value === undefined)) return undefined;
  const states = values as DevicePermissionStatus[];
  const first = states[0];
  if (kind === 'calendar') {
    if (
      (first?.state === 'denied' || first?.state === 'undetermined') &&
      statuses['calendar.write']?.state === 'granted'
    ) {
      return { state: 'limited', canAskAgain: statuses['calendar.read']?.canAskAgain ?? false };
    }
    return first;
  }
  // Photo saving and browsing are separate: permission to save must not imply library access.
  if (kind !== 'health') return first;
  return summarizeDevicePermissions(permissionConfig[kind].scopes, statuses);
}

export function isPermissionSupported(kind: PermissionKind, statuses: PermissionStatuses): boolean {
  return !permissionConfig[kind].scopes.every((scope) => statuses[scope]?.reason === 'unsupported');
}

export function getPermissionAction(
  status: DevicePermissionStatus | undefined,
): PermissionAction | undefined {
  if (!status || status.reason === 'unsupported' || status.reason === 'native-unavailable')
    return undefined;
  if (status.state === 'error') return 'retry';
  if (canRequestDevicePermission(status)) return 'request';
  return 'open-settings';
}

export function getPermissionStatusKey(
  kind: PermissionKind,
  status: DevicePermissionStatus,
): string {
  if (status.reason) return `settings.permissions.reason.${status.reason}`;
  if (kind === 'calendar' && status.state === 'limited')
    return 'settings.permissions.calendar.addOnly';
  if (kind === 'photos' && status.state === 'limited')
    return 'settings.permissions.photos.selected';
  if (kind === 'location' && status.state === 'granted' && status.accuracy)
    return `settings.permissions.location.${status.accuracy}`;
  return `settings.permissions.status.${status.state}`;
}
