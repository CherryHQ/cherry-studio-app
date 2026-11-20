import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

/** React binding for the account-scoped Cloud snapshot; credentials stay behind the module. */
export function useCloud() {
  const cloud = useBackendModule('cloud');
  const state = useSyncExternalStore(cloud.subscribe, cloud.getState, cloud.getState);
  return { cloud, state };
}
