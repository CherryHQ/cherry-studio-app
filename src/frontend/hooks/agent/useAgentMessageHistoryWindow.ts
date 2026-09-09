import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { queryKeys } from '@/frontend/data';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { useMessageRenderWindow } from '@/frontend/hooks/chat/useMessageRenderWindow';
import { getOlderLoadAction } from '@/frontend/hooks/chat/utils/messageHistoryWindowStrategy';
import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

export type AgentMessageHistoryWindow = {
  dataKey?: string;
  error?: Error;
  hasNewerMessages: boolean;
  initialScrollTarget?: 'end' | { messageId: string };
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  isLoadingNewer: boolean;
  loadOlder: () => Promise<void>;
  loadNewer: () => Promise<void>;
  messages: readonly AgentMessageView[];
  returnToLatest?: () => void;
  retry: () => Promise<void>;
};

type MessageNavigation = {
  messageId?: string;
  messageRequestId?: string;
};

function flattenMessagePages(pages: readonly AgentSessionMessagePage[]): AgentMessageView[] {
  const messages: AgentMessageView[] = [];
  const seen = new Set<string>();
  for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex -= 1) {
    const page = pages[pageIndex];
    for (let itemIndex = page.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const message = page.items[itemIndex];
      if (!seen.has(message.id)) {
        seen.add(message.id);
        messages.push(message);
      }
    }
  }
  return messages;
}

/** One transcript window, initially at either the live edge or a search result. */
export function useAgentMessageHistoryWindow(
  sessionId: string | undefined,
  navigation: MessageNavigation = {},
): AgentMessageHistoryWindow {
  const apiClient = useApiClient();
  const { messageId, messageRequestId } = navigation;
  const navigationKey = JSON.stringify([sessionId, messageId, messageRequestId]);
  const [latestNavigationKey, setLatestNavigationKey] = useState<string>();
  const isReturningToLatest = latestNavigationKey === navigationKey;
  const aroundMessageId = isReturningToLatest ? undefined : messageId;
  const isAroundMessage = Boolean(aroundMessageId);
  const dataKey = messageId
    ? `${navigationKey}:${isAroundMessage ? 'message' : 'latest'}`
    : sessionId;
  const initialPageParam: ListAgentSessionMessagesQueryParams = { aroundMessageId };
  const query = useInfiniteQuery({
    enabled: Boolean(sessionId),
    getNextPageParam: (
      page: AgentSessionMessagePage,
    ): ListAgentSessionMessagesQueryParams | undefined =>
      page.nextCursor ? { cursor: page.nextCursor, direction: 'older' } : undefined,
    getPreviousPageParam: (
      page: AgentSessionMessagePage,
    ): ListAgentSessionMessagesQueryParams | undefined =>
      page.previousCursor ? { cursor: page.previousCursor, direction: 'newer' } : undefined,
    initialPageParam,
    queryFn: async ({ pageParam, signal }) => {
      const page = await apiClient.get(
        `/agent-sessions/${sessionId ?? '__missing_session__'}/messages`,
        {
          query: { ...pageParam, limit: messageWindowPolicy.initialFetchCount },
        },
      );
      if (signal.aborted) throw new Error('Message history request cancelled');
      return page;
    },
    queryKey: [
      ...queryKeys.agentSessions.messages(sessionId ?? '__missing_session__'),
      {
        aroundMessageId,
        ...(aroundMessageId ? { messageRequestId } : {}),
        limit: messageWindowPolicy.initialFetchCount,
      },
    ],
    staleTime: messageWindowPolicy.staleTimeMs,
    // Each search selection gets a fresh window; discard inactive copies promptly.
    ...(aroundMessageId ? { gcTime: messageWindowPolicy.staleTimeMs } : {}),
  });
  const allMessages = useMemo(
    () => flattenMessagePages(query.data?.pages ?? []),
    [query.data?.pages],
  );
  const { hasHiddenMessages, hiddenMessageCount, revealMore, visibleMessages } =
    useMessageRenderWindow(allMessages);
  const { fetchNextPage, fetchPreviousPage, hasNextPage, hasPreviousPage, isFetching, refetch } =
    query;
  const loadOlder = useCallback(async () => {
    if (
      !isAroundMessage &&
      getOlderLoadAction({ hasHiddenMessages, hiddenMessageCount }) === 'reveal'
    ) {
      revealMore();
    } else if (hasNextPage && !isFetching) {
      await fetchNextPage({ cancelRefetch: false });
    }
  }, [
    fetchNextPage,
    hasHiddenMessages,
    hasNextPage,
    hiddenMessageCount,
    isAroundMessage,
    isFetching,
    revealMore,
  ]);
  const loadNewer = useCallback(async () => {
    if (hasPreviousPage && !isFetching) {
      await fetchPreviousPage({ cancelRefetch: false });
    }
  }, [fetchPreviousPage, hasPreviousPage, isFetching]);
  const returnToLatest = useCallback(() => {
    setLatestNavigationKey(navigationKey);
  }, [navigationKey]);
  const retry = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    dataKey,
    error: query.error ?? undefined,
    // An initial target query has not established continuity with the live edge yet.
    hasNewerMessages: isAroundMessage && (!query.data || Boolean(hasPreviousPage)),
    initialScrollTarget: aroundMessageId
      ? { messageId: aroundMessageId }
      : isReturningToLatest
        ? 'end'
        : undefined,
    isLoadingInitial: query.isLoading,
    isLoadingOlder: query.isFetchingNextPage,
    isLoadingNewer: query.isFetchingPreviousPage,
    loadOlder,
    loadNewer,
    messages: isAroundMessage ? allMessages : visibleMessages,
    returnToLatest: isAroundMessage ? returnToLatest : undefined,
    retry,
  };
}

export const __testing = { flattenMessagePages };
