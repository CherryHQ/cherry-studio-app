import type { Href } from 'expo-router';

import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';

/** Leaving scan or pairing returns to setup, the connection being re-paired, or the list. */
export function pairingCancelDestination(
  setupIntent: FirstUseSetupIntent | undefined,
  connectionId: string | undefined,
): Href {
  if (setupIntent === 'chat') return '/onboarding';
  if (connectionId) {
    return { pathname: '/settings/device-connections/[connectionId]', params: { connectionId } };
  }
  return '/settings/device-connections';
}
