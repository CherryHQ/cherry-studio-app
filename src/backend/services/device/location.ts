import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { getDeviceLocation } from '../../../../modules/device-location';
import { NATIVE_TOOL_TIMEOUT_MS } from './utils';

// The Android module owns a 30-second deadline. This guard also covers a stalled bridge.
const ANDROID_LOCATION_TIMEOUT_MS = 35_000;

export async function getCurrentLocation(
  input: { includeAddress?: boolean } = {},
  signal?: AbortSignal,
) {
  const location = await getPosition(signal);
  const address =
    (input.includeAddress ?? true)
      ? await waitForLocationOperation(
          () =>
            Location.reverseGeocodeAsync({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }),
          'Reverse geocoding',
          signal,
        )
          .then((results) => results[0])
          .catch((error: unknown) => {
            if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
              throw error;
            }
            return undefined;
          })
      : undefined;

  return {
    address: address
      ? {
          city: address.city ?? null,
          country: address.country ?? null,
          district: address.district ?? null,
          formattedAddress: address.formattedAddress ?? null,
          isoCountryCode: address.isoCountryCode ?? null,
          name: address.name ?? null,
          postalCode: address.postalCode ?? null,
          region: address.region ?? null,
          street: address.street ?? null,
          subregion: address.subregion ?? null,
        }
      : null,
    coords: {
      accuracy: location.coords.accuracy ?? null,
      altitude: location.coords.altitude ?? null,
      altitudeAccuracy: location.coords.altitudeAccuracy ?? null,
      heading: location.coords.heading ?? null,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed: location.coords.speed ?? null,
    },
    provider: location.provider ?? null,
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

async function getPosition(
  signal?: AbortSignal,
): Promise<Location.LocationObject & { provider?: string | null }> {
  if (signal?.aborted) throw abortedLocationError(signal);
  if (Platform.OS !== 'android') {
    return waitForLocationOperation(
      () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      'Current location request',
      signal,
    );
  }

  const native = getDeviceLocation();
  if (!native) {
    throw Object.assign(
      new Error(
        'This app version does not include Android system location support. Install an updated app build before trying again.',
      ),
      { code: 'E_LOCATION_MODULE_UNAVAILABLE' },
    );
  }
  const requestId = native.createRequest();
  try {
    return await waitForLocationOperation(
      () => native.getCurrentPosition(requestId),
      'Android system location request',
      signal,
      ANDROID_LOCATION_TIMEOUT_MS,
    );
  } finally {
    // Idempotent after success, and cancels native listeners on abort or bridge timeout.
    native.cancelRequest(requestId);
  }
}

function abortedLocationError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error('Location request cancelled'), { name: 'AbortError' });
}

function waitForLocationOperation<T>(
  start: () => Promise<T>,
  label: string,
  signal?: AbortSignal,
  timeoutMs = NATIVE_TOOL_TIMEOUT_MS,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortedLocationError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => finish(() => reject(abortedLocationError(signal)));
    const timeoutError = Object.assign(
      new Error(
        `${label} timed out before a result was available. This does not establish a permission failure.`,
      ),
      { code: 'E_LOCATION_TIMEOUT' },
    );
    const timeout = setTimeout(() => finish(() => reject(timeoutError)), timeoutMs);
    function finish(settle: () => void) {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      settle();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      start().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
