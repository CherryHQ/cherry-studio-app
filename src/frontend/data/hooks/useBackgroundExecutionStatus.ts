import { useSyncExternalStore } from 'react';

import { useBackendModule } from '../BackendProvider';

/** One primitive subscription; streaming content never re-renders its consumers. */
export function useBackgroundExecutionStatus() {
  const execution = useBackendModule('backgroundExecution');
  return useSyncExternalStore(execution.subscribe, execution.getStatus, execution.getStatus);
}
