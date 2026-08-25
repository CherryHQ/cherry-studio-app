import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';
import { AppState, Linking, Platform } from 'react-native';
import type { HealthKit } from 'react-native-nitro-healthkit';

import type {
  DevicePermission,
  DevicePermissionAccess,
  DevicePermissionScope,
  SystemPermissionState,
} from '@/shared/contracts';

const HEALTH_AUTHORIZATION_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;
const ANDROID_HEALTH_RETURN_TIMEOUT_MS = 2 * 60 * 1000;
type HealthKitLoader = () => Promise<HealthKit>;

const permissionByScope: Record<
  DevicePermissionScope,
  { access: DevicePermissionAccess; permission: DevicePermission }
> = {
  'calendar.read': { access: 'read', permission: 'calendar' },
  'calendar.write': { access: 'write', permission: 'calendar' },
  'health.read': { access: 'read', permission: 'health' },
  'location.read': { access: 'read', permission: 'location' },
  'reminders.read': { access: 'read', permission: 'reminders' },
  'reminders.write': { access: 'write', permission: 'reminders' },
};

export class DevicePermissions {
  constructor(private readonly loadHealthKit: HealthKitLoader = loadHealthKitModule) {}

  async getStatus(
    permission: DevicePermission,
    access: DevicePermissionAccess = 'read',
  ): Promise<SystemPermissionState> {
    try {
      switch (permission) {
        case 'location':
          return toSystemPermissionState(await Location.getForegroundPermissionsAsync());
        case 'calendar':
          return toSystemPermissionState(await Calendar.getCalendarPermissions(access === 'write'));
        case 'reminders':
          if (Platform.OS !== 'ios') {
            return 'unavailable';
          }
          return toSystemPermissionState(await Calendar.getRemindersPermissions());
        case 'health':
          return this.getHealthStatus();
        default:
          return assertNever(permission, access);
      }
    } catch {
      return 'unavailable';
    }
  }

  async getStatusForScope(scope: DevicePermissionScope): Promise<SystemPermissionState> {
    const target = permissionByScope[scope];
    return this.getStatus(target.permission, target.access);
  }

  async request(
    permission: DevicePermission,
    access: DevicePermissionAccess = 'read',
  ): Promise<SystemPermissionState> {
    try {
      switch (permission) {
        case 'location':
          return toSystemPermissionState(await Location.requestForegroundPermissionsAsync());
        case 'calendar':
          return toSystemPermissionState(
            await Calendar.requestCalendarPermissions(access === 'write'),
          );
        case 'reminders':
          if (Platform.OS !== 'ios') {
            return 'unavailable';
          }
          return toSystemPermissionState(await Calendar.requestRemindersPermissions());
        case 'health':
          return this.requestHealth();
        default:
          return assertNever(permission, access);
      }
    } catch {
      return 'denied';
    }
  }

  async requestForScope(scope: DevicePermissionScope): Promise<SystemPermissionState> {
    const target = permissionByScope[scope];
    return this.request(target.permission, target.access);
  }

  async openSystemSettings(permission?: DevicePermission): Promise<void> {
    if (permission === 'health' && Platform.OS === 'android') {
      await this.requestHealth();
      return;
    }
    await Linking.openSettings();
  }

  private async getHealthStatus(): Promise<SystemPermissionState> {
    try {
      const healthKit = await this.loadHealthKit();
      if (!(await healthKit.isHealthKitAvailable())) {
        return 'unavailable';
      }

      const statuses = await Promise.all(
        HEALTH_AUTHORIZATION_TYPES.map((type) => healthKit.checkAuthorizationStatus(type)),
      );
      if (statuses.every((status) => status === 'sharingAuthorized')) {
        return 'granted';
      }
      return statuses.some((status) => status === 'notDetermined') ? 'undetermined' : 'denied';
    } catch {
      return 'unavailable';
    }
  }

  private async requestHealth(): Promise<SystemPermissionState> {
    try {
      const healthKit = await this.loadHealthKit();
      if (!(await healthKit.isHealthKitAvailable())) {
        return 'unavailable';
      }

      const returnWaiter = Platform.OS === 'android' ? createAppReturnWaiter() : undefined;
      const authorized = await healthKit.requestAuthorization();
      if (authorized) {
        returnWaiter?.cancel();
        return 'granted';
      }

      if (returnWaiter) {
        await returnWaiter.promise;
      }
      return this.getHealthStatus();
    } catch {
      return 'denied';
    }
  }
}

/**
 * Shared instance. The class carries no per-instance state — its only field is
 * the HealthKit loader test seam, and the Android return waiter is scoped to the
 * call that creates it — so one instance is as good as many.
 */
export const devicePermissions = new DevicePermissions();

async function loadHealthKitModule() {
  const { getHealthKit } = await import('react-native-nitro-healthkit');
  return getHealthKit();
}

function createAppReturnWaiter() {
  let leftApp = AppState.currentState !== 'active';
  let resolvePromise = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  const timeout = setTimeout(resolvePromise, ANDROID_HEALTH_RETURN_TIMEOUT_MS);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') {
      leftApp = true;
    } else if (leftApp) {
      resolvePromise();
    }
  });
  const settle = () => {
    clearTimeout(timeout);
    subscription.remove();
    resolvePromise();
  };
  promise.finally(settle).catch(() => undefined);

  return { cancel: settle, promise };
}

function toSystemPermissionState(response: {
  granted: boolean;
  status: string;
}): SystemPermissionState {
  if (response.granted) {
    return 'granted';
  }
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

function assertNever(value: never, access: DevicePermissionAccess): never {
  throw new Error(`Unsupported ${access} permission: ${String(value)}`);
}
