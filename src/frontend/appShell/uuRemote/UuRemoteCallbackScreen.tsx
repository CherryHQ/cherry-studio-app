import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { uuRemoteCallbacks } from './nativeIntent';

/** Cold-start placeholder beneath StartupCoordinator; warm callbacks never open this route. */
export function UuRemoteCallbackScreen() {
  const router = useRouter();
  useEffect(() => {
    // A direct/internal visit without a staged native callback must not leave startup covered.
    if (!uuRemoteCallbacks.getSnapshot()) router.replace('/');
  }, [router]);
  return null;
}
