import type {
  DevicePermission,
  PermissionStatuses,
  PermissionsBackend,
  SetPermissionPolicyResult,
  SystemPermissionState,
} from '@/shared/contracts';
import type { PermissionMode, PermissionPreferenceKey } from '@cherrystudio/shared/data/preference';

type PermissionDevice = {
  getStatus(key: PermissionPreferenceKey): Promise<SystemPermissionState>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  request(key: PermissionPreferenceKey): Promise<SystemPermissionState>;
};

type PermissionPreferences = {
  readCached(key: PermissionPreferenceKey): PermissionMode;
  set(key: PermissionPreferenceKey, value: PermissionMode): Promise<void>;
};

export type PermissionsServiceDependencies = {
  device: PermissionDevice;
  preferences: PermissionPreferences;
};

export class PermissionsService implements PermissionsBackend {
  constructor(private readonly dependencies: PermissionsServiceDependencies) {}

  async getStatuses(keys: readonly PermissionPreferenceKey[]): Promise<PermissionStatuses> {
    const entries = await Promise.all(
      unique(keys).map(
        async (key) => [key, await this.dependencies.device.getStatus(key)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  openSystemSettings(permission?: DevicePermission): Promise<void> {
    return this.dependencies.device.openSystemSettings(permission);
  }

  async recover(keys: readonly PermissionPreferenceKey[]): Promise<PermissionStatuses> {
    const statuses = await this.getStatuses(keys);
    const missingKeys = unique(keys).filter((key) => statuses[key] !== 'granted');
    if (missingKeys.length === 0) {
      return statuses;
    }

    if (missingKeys.every((key) => statuses[key] === 'undetermined')) {
      const requested = await Promise.all(
        missingKeys.map(async (key) => [key, await this.dependencies.device.request(key)] as const),
      );
      return { ...statuses, ...Object.fromEntries(requested) };
    }

    await this.dependencies.device.openSystemSettings(permissionForPreference(missingKeys[0]));
    return statuses;
  }

  async setPolicy(
    key: PermissionPreferenceKey,
    policy: PermissionMode,
  ): Promise<SetPermissionPolicyResult> {
    const currentPolicy = this.dependencies.preferences.readCached(key);
    let status = await this.dependencies.device.getStatus(key);

    if (currentPolicy === policy) {
      return { policy, status };
    }

    if (currentPolicy === 'never' && policy !== 'never' && status !== 'granted') {
      status = await this.dependencies.device.request(key);
      if (status !== 'granted') {
        return { policy: currentPolicy, status };
      }
    }

    await this.dependencies.preferences.set(key, policy);
    return { policy, status };
  }
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
