import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Linking, Platform } from 'react-native';

import {
  canRequestDevicePermission,
  type DevicePermission,
  type DevicePermissionScope,
  type DevicePermissionStatus,
  HEALTH_DATA_TYPES,
  type HealthDataType,
  healthPermissionScope,
  type PermissionStatuses,
  type PermissionsModule,
} from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getHealthAccess, type HealthAccessModule } from '../../../../modules/health-access';

const logger = loggerService.withContext('DevicePermissions');
const unsupported: DevicePermissionStatus = {
  state: 'unavailable',
  canAskAgain: false,
  reason: 'unsupported',
};
const failed: DevicePermissionStatus = { state: 'error', canAskAgain: false };

type ExpoPermission = {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
};

export class DevicePermissions implements PermissionsModule {
  private requestQueue = Promise.resolve();

  constructor(
    private readonly loadHealthAccess: () => HealthAccessModule | null = getHealthAccess,
  ) {}

  async getStatuses(scopes: readonly DevicePermissionScope[]): Promise<PermissionStatuses> {
    const unique = [...new Set(scopes)];
    const healthTypes = healthTypesForScopes(unique);
    const [healthStatuses, entries] = await Promise.all([
      healthTypes.length ? this.getHealthStatuses(healthTypes) : {},
      Promise.all(
        unique
          .filter((scope) => !scope.startsWith('health.'))
          .map(async (scope) => {
            try {
              return [scope, await this.getStatus(scope)] as const;
            } catch (error) {
              logger.warn('Permission lookup failed', { scope, error });
              return [scope, failed] as const;
            }
          }),
      ),
    ]);
    return { ...Object.fromEntries(entries), ...healthStatuses };
  }

  request(
    scopes: readonly DevicePermissionScope[],
    signal?: AbortSignal,
  ): Promise<PermissionStatuses> {
    // Only one system authorization sheet at a time, including requests from an Agent.
    // Keep the queue locked until an already-open native sheet settles, even after cancellation.
    const unique = [...new Set(scopes)];
    const result = this.requestQueue.then(() => this.requestPermissions(unique, signal));
    this.requestQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async openSystemSettings(permission?: DevicePermission): Promise<void> {
    if (
      permission === 'location' &&
      Platform.OS === 'android' &&
      !(await Location.hasServicesEnabledAsync())
    ) {
      const { ActivityAction, startActivityAsync } = await import('expo-intent-launcher');
      await startActivityAsync(ActivityAction.LOCATION_SOURCE_SETTINGS);
      return;
    }
    if (permission === 'health' && Platform.OS === 'android') {
      const health = this.loadHealthAccess();
      if (!health) throw new Error('Health access native module is missing');
      await health.openSettings();
      return;
    }
    await Linking.openSettings();
  }

  private async getStatus(scope: DevicePermissionScope): Promise<DevicePermissionStatus> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return unsupported;
    switch (scope) {
      case 'location.read': {
        const [permission, enabled] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          Location.hasServicesEnabledAsync(),
        ]);
        if (!enabled)
          return { state: 'unavailable', canAskAgain: false, reason: 'service-disabled' };
        const accuracy = permission.ios?.accuracy ?? permission.android?.accuracy;
        return {
          ...toPermissionStatus(permission),
          ...(permission.granted &&
            accuracy &&
            accuracy !== 'none' && {
              accuracy: accuracy === 'full' || accuracy === 'fine' ? 'precise' : 'approximate',
            }),
        };
      }
      case 'calendar.read':
        return toPermissionStatus(await Calendar.getCalendarPermissions(false));
      case 'calendar.write':
        return toPermissionStatus(await Calendar.getCalendarPermissions(true));
      case 'reminders.read':
      case 'reminders.write':
        return Platform.OS === 'ios'
          ? toPermissionStatus(await Calendar.getRemindersPermissions())
          : unsupported;
      case 'camera.read':
        return toPermissionStatus(await ImagePicker.getCameraPermissionsAsync());
      case 'photos.read':
        return toPermissionStatus(await MediaLibrary.getPermissionsAsync(false, ['photo']));
      case 'photos.write':
        // Expo's modern MediaStore writer starts at Android 11; its older writer
        // still requires WRITE_EXTERNAL_STORAGE, including on Android 10.
        return Platform.OS === 'android' && Number(Platform.Version) >= 30
          ? { state: 'granted', canAskAgain: false }
          : toPermissionStatus(await MediaLibrary.getPermissionsAsync(true, ['photo']));
      default:
        throw new Error(`Unexpected permission scope: ${scope}`);
    }
  }

  private async requestPermissions(
    scopes: readonly DevicePermissionScope[],
    signal?: AbortSignal,
  ): Promise<PermissionStatuses> {
    signal?.throwIfAborted();
    const before = await this.getStatuses(scopes);
    signal?.throwIfAborted();
    const requestable = scopes.filter((scope) => canRequestDevicePermission(before[scope]));
    const healthTypes = healthTypesForScopes(requestable);
    if (healthTypes.length) {
      const health = this.loadHealthAccess();
      if (!health) throw new Error('Health access native module is missing');
      await health.request(healthTypes);
    }
    for (const scope of requestable.filter((scope) => !scope.startsWith('health.'))) {
      signal?.throwIfAborted();
      // An earlier request may have already granted both scopes (calendar/reminders).
      if (!canRequestDevicePermission(await this.getStatus(scope))) continue;
      signal?.throwIfAborted();
      switch (scope) {
        case 'location.read':
          await Location.requestForegroundPermissionsAsync();
          break;
        case 'calendar.read':
          await Calendar.requestCalendarPermissions(false);
          break;
        case 'calendar.write':
          await Calendar.requestCalendarPermissions(true);
          break;
        case 'reminders.read':
        case 'reminders.write':
          await Calendar.requestRemindersPermissions();
          break;
        case 'camera.read':
          await ImagePicker.requestCameraPermissionsAsync();
          break;
        case 'photos.read':
          await MediaLibrary.requestPermissionsAsync(false, ['photo']);
          break;
        case 'photos.write':
          await MediaLibrary.requestPermissionsAsync(true, ['photo']);
          break;
      }
    }
    signal?.throwIfAborted();
    const statuses = await this.getStatuses(scopes);
    signal?.throwIfAborted();
    return statuses;
  }

  private async getHealthStatuses(types: readonly HealthDataType[]): Promise<PermissionStatuses> {
    const fill = (status: DevicePermissionStatus): PermissionStatuses =>
      Object.fromEntries(types.map((type) => [healthPermissionScope(type), status]));
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return fill(unsupported);
    try {
      const health = this.loadHealthAccess();
      if (!health) return fill({ ...failed, reason: 'native-unavailable' });
      const availability = await health.getAvailability();
      if (availability !== 'available') {
        return fill({ state: 'unavailable', canAskAgain: false, reason: availability });
      }
      const statuses = await health.getStatuses(types);
      return Object.fromEntries(
        types.map((type) => [healthPermissionScope(type), statuses[type] ?? failed]),
      );
    } catch (error) {
      logger.warn('Health permission lookup failed', { error });
      return fill(failed);
    }
  }
}

export const devicePermissions = new DevicePermissions();

function healthTypesForScopes(scopes: readonly DevicePermissionScope[]): HealthDataType[] {
  return HEALTH_DATA_TYPES.filter((type) => scopes.includes(healthPermissionScope(type)));
}

function toPermissionStatus(response: ExpoPermission): DevicePermissionStatus {
  return {
    state:
      response.accessPrivileges === 'limited'
        ? 'limited'
        : response.granted
          ? 'granted'
          : response.status === 'undetermined'
            ? 'undetermined'
            : 'denied',
    canAskAgain: response.canAskAgain,
  };
}
