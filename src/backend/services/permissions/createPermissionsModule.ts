import type {
  PermissionMode,
  PermissionPreferenceKey,
} from '@cherrystudio/universal/data/preference';

import type {
  DevicePermission,
  PermissionStatuses,
  PermissionsModule,
  SetPermissionPolicyResult,
  SystemPermissionState,
} from '@/shared/contracts';

type PermissionDevice = {
  getStatus(key: PermissionPreferenceKey): Promise<SystemPermissionState>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  request(key: PermissionPreferenceKey): Promise<SystemPermissionState>;
};

type PermissionPreferences = {
  readCached(key: PermissionPreferenceKey): PermissionMode;
  set(key: PermissionPreferenceKey, value: PermissionMode): Promise<void>;
};

export type PermissionsModuleDependencies = {
  device: PermissionDevice;
  preferences: PermissionPreferences;
};

export function createPermissionsModule(
  dependencies: PermissionsModuleDependencies,
): PermissionsModule {
  const getStatuses = async (
    keys: readonly PermissionPreferenceKey[],
  ): Promise<PermissionStatuses> => {
    const entries = await Promise.all(
      unique(keys).map(async (key) => [key, await dependencies.device.getStatus(key)] as const),
    );
    return Object.fromEntries(entries);
  };

  const openSystemSettings = (permission?: DevicePermission): Promise<void> =>
    dependencies.device.openSystemSettings(permission);

  const recover = async (keys: readonly PermissionPreferenceKey[]): Promise<PermissionStatuses> => {
    const statuses = await getStatuses(keys);
    const missingKeys = unique(keys).filter((key) => statuses[key] !== 'granted');
    if (missingKeys.length === 0) {
      return statuses;
    }

    if (missingKeys.every((key) => statuses[key] === 'undetermined')) {
      const requested = await Promise.all(
        missingKeys.map(async (key) => [key, await dependencies.device.request(key)] as const),
      );
      return { ...statuses, ...Object.fromEntries(requested) };
    }

    await dependencies.device.openSystemSettings(permissionForPreference(missingKeys[0]));
    return statuses;
  };

  const setPolicy = async (
    key: PermissionPreferenceKey,
    policy: PermissionMode,
  ): Promise<SetPermissionPolicyResult> => {
    const currentPolicy = dependencies.preferences.readCached(key);
    let status = await dependencies.device.getStatus(key);

    if (currentPolicy === policy) {
      return { policy, status };
    }

    if (currentPolicy === 'never' && policy !== 'never' && status !== 'granted') {
      status = await dependencies.device.request(key);
      if (status !== 'granted') {
        return { policy: currentPolicy, status };
      }
    }

    await dependencies.preferences.set(key, policy);
    return { policy, status };
  };

  return { getStatuses, openSystemSettings, recover, setPolicy };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function permissionForPreference(key: PermissionPreferenceKey): DevicePermission {
  if (key.includes('calendar')) return 'calendar';
  if (key.includes('health')) return 'health';
  if (key.includes('location')) return 'location';
  return 'reminders';
}
