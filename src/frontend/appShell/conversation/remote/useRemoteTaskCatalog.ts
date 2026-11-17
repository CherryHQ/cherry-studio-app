import { useCatalog } from '../useConversationCatalog';
import { useRemoteConversationSource } from './useRemoteConversationSource';

export function useRemoteTasks(enabled: boolean) {
  const { tasks } = useRemoteConversationSource();
  const query = useCatalog(['tasks'], tasks.list, enabled, { refetchInterval: 15_000 });
  // Desktop offset pages can overlap when tasks are inserted between reads.
  return { ...query, items: [...new Map(query.items.map((task) => [task.id, task])).values()] };
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
