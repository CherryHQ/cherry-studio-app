import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { queryKeys } from '@/frontend/data';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';

import {
  createAgentMessageListProjectionCache,
  toAgentMessageListItems,
} from './agentMessageProjection';
import { useAgentLiveAnswers } from './ChatProvider';

/**
 * The answers to one question by id, so each can be shown beside the selected one. A running
 * answer is read from the Session's live rows; a settled one from history, in one request for the
 * whole group that refreshes with the transcript.
 */
export function useAgentAnswers(sessionId: string | undefined, ids: readonly string[]) {
  const apiClient = useApiClient();
  const [projection] = useState(createAgentMessageListProjectionCache);
  const live = useAgentLiveAnswers(sessionId, ids);
  const settledIds = ids.filter((_, index) => !live[index]);
  const settled = useQuery({
    enabled: Boolean(sessionId) && settledIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      (
        await apiClient.get(`/agent-sessions/${sessionId ?? '__missing_session__'}/messages`, {
          query: { ids: settledIds },
          signal,
        })
      ).items,
    // Under the transcript key, so whatever refreshes the transcript refreshes these too.
    queryKey: [
      ...queryKeys.agentSessions.messages(sessionId ?? '__missing_session__'),
      { answers: settledIds },
    ],
    staleTime: messageWindowPolicy.staleTimeMs,
  });
  const answers = useMemo(() => {
    const messages = new Map(
      (settled.data ?? [])
        .filter((message) => ids.includes(message.id))
        .map((message) => [message.id, message]),
    );
    for (const message of live) {
      if (message) messages.set(message.id, message);
    }
    return new Map(
      toAgentMessageListItems([...messages.values()], projection).map((item) => [item.id, item]),
    );
  }, [ids, live, projection, settled.data]);
  return { answers, isError: settled.isError, refetch: settled.refetch };
}
