import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import type { DevicePermissionStatus, HealthDataType } from '@/shared/contracts';

import { DevicePermissions } from '../DevicePermissions';

jest.mock('expo-calendar', () => ({
  getCalendarPermissions: jest.fn(),
  getRemindersPermissions: jest.fn(),
  requestCalendarPermissions: jest.fn(),
  requestRemindersPermissions: jest.fn(),
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('expo-media-library', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const allowed = { granted: true, status: 'granted', canAskAgain: false };
const refused = { granted: false, status: 'denied', canAskAgain: false };
const originalPlatform = Platform.OS;
const originalVersion = Platform.Version;

function nativeHealthStatuses(
  types: readonly HealthDataType[],
  state: DevicePermissionStatus['state'],
) {
  return Object.fromEntries(
    types.map((type) => [type, { state, canAskAgain: state === 'undetermined' }]),
  );
}

describe('DevicePermissions', () => {
  const health = {
    getAvailability: jest.fn(
      async (): Promise<'available' | 'unsupported' | 'install-required'> => 'available',
    ),
    getStatuses: jest.fn(async (types: readonly HealthDataType[]) =>
      nativeHealthStatuses(types, 'undetermined'),
    ),
    request: jest.fn(async (types: readonly HealthDataType[]) =>
      nativeHealthStatuses(types, 'requested'),
    ),
    openSettings: jest.fn(async () => undefined),
  };
  let service: DevicePermissions;

  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.mocked(Calendar.getCalendarPermissions).mockResolvedValue(allowed as never);
    jest.mocked(Calendar.getRemindersPermissions).mockResolvedValue(allowed as never);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(allowed as never);
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
    jest.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue(allowed as never);
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue(allowed as never);
    health.getAvailability.mockResolvedValue('available');
    health.getStatuses.mockImplementation(async (types) =>
      nativeHealthStatuses(types, 'undetermined'),
    );
    health.request.mockImplementation(async (types) => {
      health.getStatuses.mockImplementation(async (queried) =>
        nativeHealthStatuses(queried, 'requested'),
      );
      return nativeHealthStatuses(types, 'requested');
    });
    health.openSettings.mockResolvedValue(undefined);
    service = new DevicePermissions(() => health);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: originalVersion });
  });

  test('deduplicates scopes and batches health status reads without requesting access', async () => {
    await service.getStatuses([
      'calendar.read',
      'calendar.read',
      'health.steps.read',
      'health.sleep.read',
    ]);
    expect(Calendar.getCalendarPermissions).toHaveBeenCalledTimes(1);
    expect(health.getStatuses).toHaveBeenCalledWith(['steps', 'sleep']);
    expect(health.request).not.toHaveBeenCalled();
  });

  test('keeps an iOS write-only calendar useful and allows requesting full access', async () => {
    jest
      .mocked(Calendar.getCalendarPermissions)
      .mockImplementation(async (writeOnly) => (writeOnly ? allowed : refused) as never);
    await expect(service.getStatuses(['calendar.read', 'calendar.write'])).resolves.toEqual({
      'calendar.read': { state: 'denied', canAskAgain: true },
      'calendar.write': { state: 'granted', canAskAgain: false },
    });
    await service.request(['calendar.read']);
    expect(Calendar.requestCalendarPermissions).toHaveBeenCalledWith(false);
  });

  test('does not describe completed HealthKit inquiries as read grants', async () => {
    await expect(service.request(['health.steps.read'])).resolves.toEqual({
      'health.steps.read': { state: 'requested', canAskAgain: false },
    });
    expect(health.request).toHaveBeenCalledWith(['steps']);
  });

  test('preserves independent Android health grants', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    health.getStatuses.mockResolvedValue({
      steps: { state: 'granted', canAskAgain: false },
      workouts: { state: 'denied', canAskAgain: false },
    });
    await expect(
      service.getStatuses(['health.steps.read', 'health.workouts.read']),
    ).resolves.toEqual({
      'health.steps.read': { state: 'granted', canAskAgain: false },
      'health.workouts.read': { state: 'denied', canAskAgain: false },
    });
  });

  test('opens Android health management even when every read is granted', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    health.getStatuses.mockImplementation(async (types) => nativeHealthStatuses(types, 'granted'));
    await service.openSystemSettings('health');
    expect(health.openSettings).toHaveBeenCalledTimes(1);
    expect(health.request).not.toHaveBeenCalled();
  });

  test.each(['unsupported', 'install-required'] as const)(
    'preserves the recoverability of %s health services',
    async (reason) => {
      health.getAvailability.mockResolvedValue(reason);
      await expect(service.getStatuses(['health.steps.read'])).resolves.toEqual({
        'health.steps.read': { state: 'unavailable', canAskAgain: false, reason },
      });
      expect(health.getStatuses).not.toHaveBeenCalled();
    },
  );

  test('a missing native module needs an app update, not another permission request', async () => {
    service = new DevicePermissions(() => null);
    await expect(service.getStatuses(['health.steps.read'])).resolves.toEqual({
      'health.steps.read': { state: 'error', canAskAgain: false, reason: 'native-unavailable' },
    });
  });

  test('lookup and request failures are not described as user denials', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockRejectedValue(new Error('native failed'));
    await expect(service.getStatuses(['location.read'])).resolves.toEqual({
      'location.read': { state: 'error', canAskAgain: false },
    });
    jest
      .mocked(ImagePicker.getCameraPermissionsAsync)
      .mockResolvedValue({ ...refused, canAskAgain: true } as never);
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockRejectedValue(new Error('camera failed'));
    await expect(service.request(['camera.read'])).rejects.toThrow('camera failed');
  });

  test('reports location service shutdown separately from app authorization', async () => {
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
    await expect(service.getStatuses(['location.read'])).resolves.toEqual({
      'location.read': { state: 'unavailable', canAskAgain: false, reason: 'service-disabled' },
    });
    await service.request(['location.read']);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  test('keeps selected-photo access usable without claiming access to the whole library', async () => {
    jest
      .mocked(MediaLibrary.getPermissionsAsync)
      .mockResolvedValue({ ...allowed, accessPrivileges: 'limited' } as never);
    await expect(service.getStatuses(['photos.read'])).resolves.toEqual({
      'photos.read': { state: 'limited', canAskAgain: false },
    });
  });

  test('does not request photo reading or storage permissions for the modern Android writer', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: 30 });
    await expect(service.request(['photos.write'])).resolves.toEqual({
      'photos.write': { state: 'granted', canAskAgain: false },
    });
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.getPermissionsAsync).not.toHaveBeenCalled();
  });
});
