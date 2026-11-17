import type { Href } from 'expo-router';

/** Leaving scan or pairing returns to the connection being re-paired or the list. */
export function pairingCancelDestination(connectionId: string | undefined): Href {
  if (connectionId) {
    return { pathname: '/settings/device-connections/[connectionId]', params: { connectionId } };
  }
  return '/settings/device-connections';
}
