import { usePreventRemove, useRouter } from 'expo-router';
import { useState } from 'react';

import { useOptionalNavigationShell } from '@/frontend/appShell/navigationShell/state';

import {
  type DeviceConnectionsBaseRoute,
  pairingCancelDestination,
} from './pairingCancelDestination';

/** Scan and pairing occupy one transient slot above the page that opened them. */
export function usePairingNavigation({
  connectionId,
  isMissingConnection = false,
}: {
  connectionId?: string;
  isMissingConnection?: boolean;
}) {
  const router = useRouter();
  const shell = useOptionalNavigationShell();
  const baseRoute: DeviceConnectionsBaseRoute =
    shell?.activeDestination === 'devices' ? '/devices' : '/settings/device-connections';
  const [leaving, setLeaving] = useState(false);
  const cancel: () => void = () => {
    if (isMissingConnection) {
      setLeaving(true);
      allowLeave();
      router.dismissTo(baseRoute);
    } else if (router.canGoBack()) router.back();
    else router.replace(pairingCancelDestination(connectionId, baseRoute));
  };
  // A removed repair source must not be exposed by native back either.
  const allowLeave = usePreventRemove(isMissingConnection && !leaving, cancel);
  return { baseRoute, cancel };
}
