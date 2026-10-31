import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

export function useAccount() {
  const account = useBackendModule('account');
  const state = useSyncExternalStore(account.subscribe, account.getState, account.getState);
  return { account, state };
}
