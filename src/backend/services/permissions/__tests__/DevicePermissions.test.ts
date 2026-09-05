import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';

import { DevicePermissions } from '../DevicePermissions';

const mockHealthKit = {
  checkAuthorizationStatus: jest.fn(async (_type: string): Promise<string> => 'sharingAuthorized'),
  isHealthKitAvailable: jest.fn(async () => true),
  requestAuthorization: jest.fn(async () => true),
};

jest.mock('expo-calendar', () => ({
  getCalendarPermissions: jest.fn(),
  getRemindersPermissions: jest.fn(),
  requestCalendarPermissions: jest.fn(),
  requestRemindersPermissions: jest.fn(),
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));
const granted = { granted: true, status: 'granted' };
const denied = { granted: false, status: 'denied' };

describe('DevicePermissions', () => {
  let service: DevicePermissions;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Calendar.getCalendarPermissions).mockResolvedValue(granted as never);
    jest.mocked(Calendar.requestCalendarPermissions).mockResolvedValue(granted as never);
    jest.mocked(Calendar.getRemindersPermissions).mockResolvedValue(granted as never);
    jest.mocked(Calendar.requestRemindersPermissions).mockResolvedValue(granted as never);
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(granted as never);
    mockHealthKit.isHealthKitAvailable.mockResolvedValue(true);
    mockHealthKit.checkAuthorizationStatus.mockResolvedValue('sharingAuthorized');
    mockHealthKit.requestAuthorization.mockResolvedValue(true);
    service = new DevicePermissions(async () => mockHealthKit as never);
  });

  test('uses full calendar access for read and write-only access for write', async () => {
    await expect(service.getStatusForScope('calendar.read')).resolves.toBe('granted');
    await expect(service.getStatusForScope('calendar.write')).resolves.toBe('granted');

    expect(Calendar.getCalendarPermissions).toHaveBeenNthCalledWith(1, false);
    expect(Calendar.getCalendarPermissions).toHaveBeenNthCalledWith(2, true);
  });

  test('requests only the calendar access represented by the app scope', async () => {
    await service.requestForScope('calendar.read');
    await service.requestForScope('calendar.write');

    expect(Calendar.requestCalendarPermissions).toHaveBeenNthCalledWith(1, false);
    expect(Calendar.requestCalendarPermissions).toHaveBeenNthCalledWith(2, true);
  });

  test('maps denied and undetermined Expo permission responses', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(denied as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      granted: false,
      status: 'undetermined',
    } as never);

    await expect(service.getStatus('location')).resolves.toBe('denied');
    await expect(service.request('location')).resolves.toBe('undetermined');
  });

  test('fails closed when a native permission API throws', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockRejectedValue(new Error('native unavailable'));
    jest
      .mocked(Calendar.requestCalendarPermissions)
      .mockRejectedValue(new Error('native unavailable'));

    await expect(service.getStatus('location')).resolves.toBe('unavailable');
    await expect(service.request('calendar')).resolves.toBe('denied');
  });

  test('requires every planned health data type', async () => {
    await expect(service.getStatus('health')).resolves.toBe('granted');

    expect(mockHealthKit.checkAuthorizationStatus).toHaveBeenCalledTimes(8);
    expect(mockHealthKit.checkAuthorizationStatus).toHaveBeenCalledWith('HKWorkoutTypeIdentifier');

    mockHealthKit.checkAuthorizationStatus.mockImplementation(async (type: string) =>
      type === 'HKQuantityTypeIdentifierHeartRate' ? 'sharingDenied' : 'sharingAuthorized',
    );
    await expect(service.getStatus('health')).resolves.toBe('denied');
  });

  test('keeps unavailable or failed health access disabled', async () => {
    mockHealthKit.isHealthKitAvailable.mockResolvedValue(false);
    await expect(service.getStatus('health')).resolves.toBe('unavailable');

    mockHealthKit.isHealthKitAvailable.mockRejectedValue(new Error('native unavailable'));
    await expect(service.request('health')).resolves.toBe('denied');
  });
});
