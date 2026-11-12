import { useCatalog } from '../useConversationCatalog';
import { useRemoteConversationSource } from './useRemoteConversationSource';

export function useRemoteTasks(enabled: boolean) {
  const { catalog } = useRemoteConversationSource();
  return useCatalog(['tasks'], catalog.listTasks, enabled);
}

export function useRemoteTaskSessions(taskId: string, enabled: boolean) {
  const { catalog } = useRemoteConversationSource();
  return useCatalog(
    ['task-sessions', taskId],
    (cursor, signal) => catalog.listTaskSessions(taskId, cursor, signal),
    enabled,
  );
}
