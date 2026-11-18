import type { Href } from 'expo-router';

/** A cold pairing entry without back history falls back to its connection or the list. */
export function pairingCancelDestination(connectionId: string | undefined): Href {
  if (connectionId) {
    return { pathname: '/settings/device-connections/[connectionId]', params: { connectionId } };
  }
  return '/settings/device-connections';
}
