import { usePreventRemove, useRouter } from 'expo-router';
import { useState } from 'react';

import { pairingCancelDestination } from './pairingCancelDestination';

/** Scan and pairing occupy one transient slot above the page that opened them. */
export function usePairingNavigation({
  connectionId,
  isMissingConnection = false,
}: {
  connectionId?: string;
  isMissingConnection?: boolean;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const cancel: () => void = () => {
    if (isMissingConnection) {
      setLeaving(true);
      allowLeave();
      router.dismissTo('/settings/device-connections');
    } else if (router.canGoBack()) router.back();
    else router.replace(pairingCancelDestination(connectionId));
  };
  // A removed repair source must not be exposed by native back either.
  const allowLeave = usePreventRemove(isMissingConnection && !leaving, cancel);
  return { cancel };
}
