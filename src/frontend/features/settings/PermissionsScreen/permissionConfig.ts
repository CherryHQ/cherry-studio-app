import type {
  PermissionMode,
  PermissionPreferenceKey,
} from '@cherrystudio/universal/data/preference';

import type { DevicePermission } from '@/shared/contracts';

export const permissionKinds = ['location', 'calendar', 'reminders', 'health'] as const;
export type PermissionKind = (typeof permissionKinds)[number];

export type PermissionPolicySnapshot = Record<PermissionPreferenceKey, PermissionMode>;

export const permissionConfig: Record<
  PermissionKind,
  {
    permission: DevicePermission;
    readKey: PermissionPreferenceKey;
    writeKey?: PermissionPreferenceKey;
  }
> = {
  calendar: {
    permission: 'calendar',
    readKey: 'permissions.calendar_read',
    writeKey: 'permissions.calendar_write',
  },
  health: {
    permission: 'health',
    readKey: 'permissions.health_read',
  },
  location: {
    permission: 'location',
    readKey: 'permissions.location_read',
  },
  reminders: {
    permission: 'reminders',
    readKey: 'permissions.reminders_read',
    writeKey: 'permissions.reminders_write',
  },
};

export function isPermissionKind(value: string | undefined): value is PermissionKind {
  return permissionKinds.includes(value as PermissionKind);
}

export function getPermissionSummaryKey(
  kind: PermissionKind,
  policies: PermissionPolicySnapshot,
): string {
  const config = permissionConfig[kind];
  const readMode = policies[config.readKey];

  if (!config.writeKey) {
    if (readMode === 'never') {
      return 'settings.permissions.summary.never';
    }
    return readMode === 'ask'
      ? 'settings.permissions.summary.ask'
      : 'settings.permissions.summary.allowed';
  }

  const hasRead = readMode !== 'never';
  const hasWrite = policies[config.writeKey] !== 'never';
  if (hasRead && hasWrite) {
    return 'settings.permissions.summary.readWrite';
  }
  if (hasRead) {
    return 'settings.permissions.summary.readOnly';
  }
  return hasWrite ? 'settings.permissions.summary.writeOnly' : 'settings.permissions.summary.never';
}
