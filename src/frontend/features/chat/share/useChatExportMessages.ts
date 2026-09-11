import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '@/frontend/data';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

export function useChatExportMessages(sessionId: string, messageId: string) {
  const api = useApiClient();
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.agentSessions.messages(sessionId), { exportAround: messageId }],
    initialPageParam: { aroundMessageId: messageId } as ListAgentSessionMessagesQueryParams,
    queryFn: async ({ pageParam, signal }) => {
      signal.throwIfAborted();
      const page = await api.get(`/agent-sessions/${sessionId}/messages`, {
        query: { ...pageParam, limit: 50 },
      });
      signal.throwIfAborted();
      return page;
    },
    getNextPageParam: (page: AgentSessionMessagePage) =>
      page.nextCursor ? { cursor: page.nextCursor, direction: 'older' as const } : undefined,
    getPreviousPageParam: (page: AgentSessionMessagePage) =>
      page.previousCursor
        ? { cursor: page.previousCursor, direction: 'newer' as const }
        : undefined,
    // This selector owns its bounded window and retains only explicit selection IDs.
    maxPages: 10,
    gcTime: 0,
    staleTime: 30_000,
  });
  const messages = useMemo(() => {
    const byId = new Map(
      query.data?.pages.flatMap((page) => page.items).map((message) => [message.id, message]),
    );
    return [...byId.values()].filter((message) => message.role !== 'system');
  }, [query.data]);
  return { query, messages };
}
