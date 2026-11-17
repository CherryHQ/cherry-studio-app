import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

export function useAppIcon() {
  const appIcon = useBackendModule('appIcon');
  const state = useSyncExternalStore(appIcon.subscribe, appIcon.getState, appIcon.getState);
  return { appIcon, state };
}
