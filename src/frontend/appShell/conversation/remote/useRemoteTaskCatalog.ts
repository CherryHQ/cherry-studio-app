import { useCatalog } from '../useConversationCatalog';
import { useRemoteConversationSource } from './useRemoteConversationSource';

export function useRemoteTasks(enabled: boolean) {
  const { tasks } = useRemoteConversationSource();
  return useCatalog(['tasks'], tasks.list, enabled, { refetchInterval: 15_000 });
}

export function useRemoteTaskSessions(taskId: string, enabled: boolean) {
  const { tasks } = useRemoteConversationSource();
  return useCatalog(
    ['task-sessions', taskId],
    (cursor, signal) => tasks.listSessions(taskId, cursor, signal),
    enabled,
    { refetchInterval: 15_000 },
  );
}
