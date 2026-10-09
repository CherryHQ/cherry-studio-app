import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data/BackendProvider';

export function useBackupState() {
  const backup = useBackendModule('backup');
  const state = useSyncExternalStore(backup.subscribe, backup.getState, backup.getState);
  return { backup, state };
}
