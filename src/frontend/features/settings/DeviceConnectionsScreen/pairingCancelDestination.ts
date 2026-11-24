import type { Href } from 'expo-router';

export type DeviceConnectionsBaseRoute = '/devices' | '/settings/device-connections';

/** A cold pairing entry without back history falls back to its connection or the list. */
export function pairingCancelDestination(
  connectionId: string | undefined,
  baseRoute: DeviceConnectionsBaseRoute = '/settings/device-connections',
): Href {
  if (connectionId) {
    return {
      pathname: `${baseRoute}/[connectionId]` as '/devices/[connectionId]',
      params: { connectionId },
    };
  }
  return baseRoute;
}
