import * as Application from 'expo-application';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Linking, Platform } from 'react-native';

import {
  canRequestDevicePermission,
  canUseDevicePermission,
  type DevicePermission,
  type DevicePermissionScope,
  type DevicePermissionStatus,
  HEALTH_DATA_TYPES,
  type HealthDataType,
  type HealthPermissionScope,
  healthPermissionScope,
  type PermissionStatuses,
  type PermissionsModule,
} from '@/shared/contracts';
import { healthRecordSelectionType } from '@/shared/contracts/health';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getNativeAppUpdate } from '../../../../modules/app-update';
import { getHealthAccess, type HealthAccessModule } from '../../../../modules/health-access';
import { getLocalNetworkAccess } from '../../../../modules/local-network-access';

const logger = loggerService.withContext('DevicePermissions');
const unsupported: DevicePermissionStatus = {
  state: 'unavailable',
  canAskAgain: false,
  reason: 'unsupported',
};
const failed: DevicePermissionStatus = { state: 'error', canAskAgain: false };
const HEALTH_RECORD_SELECTION_SCOPES = new Set<DevicePermissionScope>(
  HEALTH_DATA_TYPES.filter(healthRecordSelectionType).map(healthPermissionScope),
);

type ExpoPermission = {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
};

type SystemPermissionScope = Exclude<DevicePermissionScope, HealthPermissionScope>;

/** Every non-Health scope reads and requests its system grant here; the compiler keeps both. */
const systemPermissions: Record<
  SystemPermissionScope,
  { get(): Promise<DevicePermissionStatus>; request(): Promise<unknown> }
> = {
  'location.read': {
    async get() {
      const [permission, enabled] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.hasServicesEnabledAsync(),
      ]);
      if (!enabled) return { state: 'unavailable', canAskAgain: false, reason: 'service-disabled' };
      const accuracy = permission.ios?.accuracy ?? permission.android?.accuracy;
      return {
        ...toPermissionStatus(permission),
        ...(permission.granted &&
          accuracy &&
          accuracy !== 'none' && {
            accuracy: accuracy === 'full' || accuracy === 'fine' ? 'precise' : 'approximate',
          }),
      };
    },
    request: () => Location.requestForegroundPermissionsAsync(),
  },
  'calendar.read': {
    get: async () => toPermissionStatus(await Calendar.getCalendarPermissions(false)),
    request: () => Calendar.requestCalendarPermissions(false),
  },
  'calendar.write': {
    get: async () => toPermissionStatus(await Calendar.getCalendarPermissions(true)),
    request: () => Calendar.requestCalendarPermissions(true),
  },
  'reminders.read': {
    get: getRemindersStatus,
    request: () => Calendar.requestRemindersPermissions(),
  },
  'reminders.write': {
    get: getRemindersStatus,
    request: () => Calendar.requestRemindersPermissions(),
  },
  'camera.read': {
    get: async () => toPermissionStatus(await ImagePicker.getCameraPermissionsAsync()),
    request: () => ImagePicker.requestCameraPermissionsAsync(),
  },
  'photos.write': {
    // Expo's modern MediaStore writer starts at Android 11; its older writer
    // still requires WRITE_EXTERNAL_STORAGE, including on Android 10.
    get: async () =>
      Platform.OS === 'android' && Number(Platform.Version) >= 30
        ? { state: 'granted', canAskAgain: false }
        : toPermissionStatus(await MediaLibrary.getPermissionsAsync(true, ['photo'])),
    request: () => MediaLibrary.requestPermissionsAsync(true, ['photo']),
  },
};

async function getRemindersStatus(): Promise<DevicePermissionStatus> {
  return Platform.OS === 'ios'
    ? toPermissionStatus(await Calendar.getRemindersPermissions())
    : unsupported;
}

function isSystemPermissionScope(scope: DevicePermissionScope): scope is SystemPermissionScope {
  return !scope.startsWith('health.');
}

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
        unique.filter(isSystemPermissionScope).map(async (scope) => {
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
    options?: { reselectHealthRecords?: boolean },
  ): Promise<PermissionStatuses> {
    const unique = [...new Set(scopes)];
    return this.runWithSystemPrompt(() => this.requestPermissions(unique, signal, options), signal);
  }

  requestLocalNetworkAccess(signal?: AbortSignal): Promise<void> {
    return this.runWithSystemPrompt(async () => {
      // The app targets Android SDK 36, where INTERNET already grants local access.
      if (Platform.OS !== 'ios') return;
      try {
        await getLocalNetworkAccess()?.request();
      } catch (error) {
        // Preparation is best-effort; the actual pairing request owns connectivity errors.
        logger.warn('Local network prompt preparation failed', { error });
      }
    }, signal);
  }

  /** Serialize native operations that may present a system authorization sheet. */
  private runWithSystemPrompt<TResult>(
    operation: () => Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    const result = this.requestQueue.then(async () => {
      signal?.throwIfAborted();
      // Await native settlement even after cancellation; an open sheet still owns the queue.
      const value = await operation();
      signal?.throwIfAborted();
      return value;
    });
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
    await Linking.openSettings();
  }

  /** The update workflow owns the explanation; this owner serializes the system authorization. */
  requestPackageInstallAuthorization(): Promise<boolean> {
    return this.runWithSystemPrompt(async () => {
      if (Platform.OS !== 'android' || !Application.applicationId) return false;
      const native = getNativeAppUpdate();
      if (!native?.isApkInstallationEnabled()) return false;
      if (native.canInstallPackages()) return true;
      const { ActivityAction, startActivityAsync } = await import('expo-intent-launcher');
      await startActivityAsync(ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
        data: `package:${Application.applicationId}`,
      });
      return native.canInstallPackages();
    });
  }

  private async getStatus(scope: SystemPermissionScope): Promise<DevicePermissionStatus> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return unsupported;
    return systemPermissions[scope].get();
  }

  private async requestPermissions(
    scopes: readonly DevicePermissionScope[],
    signal?: AbortSignal,
    options?: { reselectHealthRecords?: boolean },
  ): Promise<PermissionStatuses> {
    signal?.throwIfAborted();
    const before = await this.getStatuses(scopes);
    signal?.throwIfAborted();
    const requestable = scopes.filter(
      (scope) =>
        canRequestDevicePermission(before[scope]) ||
        (options?.reselectHealthRecords === true &&
          HEALTH_RECORD_SELECTION_SCOPES.has(scope) &&
          canUseDevicePermission(scope, before[scope])),
    );
    const healthTypes = healthTypesForScopes(requestable);
    if (healthTypes.length) {
      const health = this.loadHealthAccess();
      if (!health) throw new Error('Health access native module is missing');
      await health.request(healthTypes);
    }
    for (const scope of requestable.filter(isSystemPermissionScope)) {
      signal?.throwIfAborted();
      // An earlier request may have already granted both scopes (calendar/reminders).
      if (!canRequestDevicePermission(await this.getStatus(scope))) continue;
      signal?.throwIfAborted();
      await systemPermissions[scope].request();
    }
    signal?.throwIfAborted();
    const statuses = await this.getStatuses(scopes);
    signal?.throwIfAborted();
    return statuses;
  }

  private async getHealthStatuses(types: readonly HealthDataType[]): Promise<PermissionStatuses> {
    const fill = (status: DevicePermissionStatus): PermissionStatuses =>
      Object.fromEntries(types.map((type) => [healthPermissionScope(type), status]));
    if (Platform.OS !== 'ios') return fill(unsupported);
    try {
      const health = this.loadHealthAccess();
      if (!health) throw new Error('Health access native module is missing');
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
    state: response.granted
      ? 'granted'
      : response.status === 'undetermined'
        ? 'undetermined'
        : 'denied',
    canAskAgain: response.canAskAgain,
  };
}
