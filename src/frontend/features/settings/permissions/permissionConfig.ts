import type {
  DevicePermission,
  DevicePermissionScope,
  PermissionStatuses,
  SystemPermissionState,
} from '@/shared/contracts';

export const permissionKinds = ['location', 'calendar', 'reminders', 'health'] as const;
export type PermissionKind = (typeof permissionKinds)[number];
export type PermissionAction = 'open-settings' | 'request';

export const permissionConfig: Record<
  PermissionKind,
  {
    permission: DevicePermission;
    requestScope: DevicePermissionScope;
    scopes: readonly DevicePermissionScope[];
  }
> = {
  calendar: {
    permission: 'calendar',
    requestScope: 'calendar.read',
    scopes: ['calendar.read', 'calendar.write'],
  },
  health: {
    permission: 'health',
    requestScope: 'health.read',
    scopes: ['health.read'],
  },
  location: {
    permission: 'location',
    requestScope: 'location.read',
    scopes: ['location.read'],
  },
  reminders: {
    permission: 'reminders',
    requestScope: 'reminders.read',
    scopes: ['reminders.read', 'reminders.write'],
  },
};

export function getPermissionStatus(
  kind: PermissionKind,
  statuses: PermissionStatuses,
): SystemPermissionState | undefined {
  const scopeStatuses = permissionConfig[kind].scopes.map((scope) => statuses[scope]);
  if (scopeStatuses.some((status) => status === undefined)) return undefined;
  if (scopeStatuses.every((status) => status === 'granted')) return 'granted';
  if (scopeStatuses.some((status) => status === 'denied')) return 'denied';
  if (scopeStatuses.some((status) => status === 'undetermined')) return 'undetermined';
  return 'unavailable';
}

export function getPermissionAction(
  status: SystemPermissionState | undefined,
): PermissionAction | undefined {
  if (status === 'undetermined') return 'request';
  if (status === 'denied' || status === 'granted') return 'open-settings';
  return undefined;
}
