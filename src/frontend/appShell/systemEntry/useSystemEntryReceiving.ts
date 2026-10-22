import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

/** Whether a claimed share is still importing, before its draft opens in the composer. */
export function useSystemEntryReceiving() {
  const module = useBackendModule('systemEntry');
  return useSyncExternalStore(module.subscribeReceiving, module.isReceiving, module.isReceiving);
}
