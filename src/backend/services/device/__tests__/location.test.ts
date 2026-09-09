import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { type DeviceLocation, getDeviceLocation } from '../../../../../modules/device-location';
import { getCurrentLocation } from '../location';

jest.mock('../../../../../modules/device-location', () => ({ getDeviceLocation: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

const position: DeviceLocation = {
  coords: {
    latitude: 31.23,
    longitude: 121.47,
    accuracy: 1200,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  provider: 'network',
  timestamp: Date.parse('2026-09-09T10:00:00Z'),
};

const native = {
  createRequest: jest.fn(() => 'location-1'),
  getCurrentPosition: jest.fn<Promise<DeviceLocation>, [string]>(),
  cancelRequest: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  native.getCurrentPosition.mockResolvedValue(position);
  jest.mocked(getDeviceLocation).mockReturnValue(native);
  jest.mocked(Location.reverseGeocodeAsync).mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('Android uses system location and preserves approximate accuracy, source, and fix time', async () => {
  await expect(getCurrentLocation({ includeAddress: false })).resolves.toEqual({
    address: null,
    coords: position.coords,
    provider: 'network',
    timestamp: '2026-09-09T10:00:00.000Z',
  });
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(native.cancelRequest).toHaveBeenCalledWith('location-1');
});

test('an old binary reports the missing native module instead of falling back to Google location', async () => {
  jest.mocked(getDeviceLocation).mockReturnValue(null);
  await expect(getCurrentLocation()).rejects.toMatchObject({
    code: 'E_LOCATION_MODULE_UNAVAILABLE',
  });
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('an already cancelled call never creates a native request', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(getCurrentLocation({}, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(native.createRequest).not.toHaveBeenCalled();
});

test('cancellation releases the native handle without waiting for a fix', async () => {
  native.getCurrentPosition.mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const request = getCurrentLocation({}, controller.signal);
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  expect(native.cancelRequest).toHaveBeenCalledTimes(1);
  expect(native.cancelRequest).toHaveBeenCalledWith('location-1');
  expect(Location.reverseGeocodeAsync).not.toHaveBeenCalled();
});

test('a stalled native response is bounded and its request is cancelled', async () => {
  native.getCurrentPosition.mockReturnValue(new Promise(() => {}));
  const request = getCurrentLocation({ includeAddress: false });
  const rejected = expect(request).rejects.toMatchObject({ code: 'E_LOCATION_TIMEOUT' });
  await jest.advanceTimersByTimeAsync(35_000);
  await rejected;
  expect(native.cancelRequest).toHaveBeenCalledWith('location-1');
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('a native provider failure retains its code and releases the request', async () => {
  const error = Object.assign(new Error('No providers enabled'), {
    code: 'E_LOCATION_SERVICES_DISABLED',
  });
  native.getCurrentPosition.mockRejectedValue(error);
  await expect(getCurrentLocation()).rejects.toBe(error);
  expect(native.cancelRequest).toHaveBeenCalledWith('location-1');
  expect(Location.reverseGeocodeAsync).not.toHaveBeenCalled();
});

test('an unavailable geocoder still returns usable coordinates', async () => {
  jest.mocked(Location.reverseGeocodeAsync).mockRejectedValue(new Error('Geocoder unavailable'));
  await expect(getCurrentLocation()).resolves.toMatchObject({
    address: null,
    coords: position.coords,
  });
});

test('cancellation during address lookup is not swallowed as a missing address', async () => {
  const controller = new AbortController();
  jest.mocked(Location.reverseGeocodeAsync).mockImplementation(() => {
    controller.abort();
    return new Promise(() => {});
  });
  await expect(getCurrentLocation({}, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

test('iOS retains Expo location without loading the Android module', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
    coords: position.coords,
    timestamp: position.timestamp,
  });
  await expect(getCurrentLocation({ includeAddress: false })).resolves.toMatchObject({
    coords: position.coords,
    provider: null,
  });
  expect(getDeviceLocation).not.toHaveBeenCalled();
});
