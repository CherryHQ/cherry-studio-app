import { useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

export function useTeamAgentState() {
  const module = useBackendModule('teamAgent');
  const state = useSyncExternalStore(module.subscribe, module.getState, module.getState);
  return { module, state };
}
