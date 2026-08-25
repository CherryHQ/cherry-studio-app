import { useCallback, useMemo, useRef, useState } from 'react';

import { useInfiniteQuery } from '@/frontend/data';
import { useMessageRenderWindow } from '@/frontend/hooks/chat/useMessageRenderWindow';
import { getOlderLoadAction } from '@/frontend/hooks/chat/utils/messageHistoryWindowStrategy';
import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export type AgentMessageHistoryWindow = {
  error?: Error;
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => Promise<void>;
  messages: readonly AgentMessageView[];
};

type OlderFetchOptions = {
  showLoading: boolean;
};

function flattenMessagePages(
  pages: readonly CursorPaginationResponse<AgentMessageView>[],
): AgentMessageView[] {
  const messages: AgentMessageView[] = [];

  for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex -= 1) {
    const page = pages[pageIndex];
    for (let itemIndex = page.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      messages.push(page.items[itemIndex]);
    }
  }

  return messages;
}

export function useAgentMessageHistoryWindow(
  sessionId: string | undefined,
): AgentMessageHistoryWindow {
  const enabled = Boolean(sessionId);
  const query = useInfiniteQuery('/agent-sessions/:sessionId/messages', {
    enabled,
    limit: messageWindowPolicy.initialFetchCount,
    params: { sessionId: sessionId ?? '__missing_session__' },
    staleTime: messageWindowPolicy.staleTimeMs,
  });
  const { error, hasNext, isLoading, isLoadingMore, loadNext, pages } = query;
  const allMessages = useMemo(() => flattenMessagePages(pages), [pages]);
  const { hasHiddenMessages, hiddenMessageCount, revealMore, visibleMessages } =
    useMessageRenderWindow(allMessages);
  const activeOlderFetchRef = useRef<Promise<void> | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const fetchOlderIfNeeded = useCallback(
    async (fetchOptions: OlderFetchOptions) => {
      const activeFetch = activeOlderFetchRef.current;
      if (activeFetch) {
        if (fetchOptions.showLoading) {
          setIsLoadingOlder(true);
          await activeFetch.finally(() => setIsLoadingOlder(false));
        }
        return;
      }

      if (!hasNext || isLoadingMore) {
        return;
      }

      const fetchPromise = loadNext();
      activeOlderFetchRef.current = fetchPromise;
      if (fetchOptions.showLoading) {
        setIsLoadingOlder(true);
      }

      await fetchPromise.finally(() => {
        if (activeOlderFetchRef.current === fetchPromise) {
          activeOlderFetchRef.current = null;
        }
        if (fetchOptions.showLoading) {
          setIsLoadingOlder(false);
        }
      });
    },
    [hasNext, isLoadingMore, loadNext],
  );

  const loadOlder = useCallback(async () => {
    const action = getOlderLoadAction({ hasHiddenMessages, hiddenMessageCount });
    if (action === 'reveal') {
      revealMore();
      return;
    }
    await fetchOlderIfNeeded({ showLoading: true });
  }, [fetchOlderIfNeeded, hasHiddenMessages, hiddenMessageCount, revealMore]);

  return {
    error,
    isLoadingInitial: isLoading,
    isLoadingOlder,
    loadOlder,
    messages: visibleMessages,
  };
}

export const __testing = { flattenMessagePages };
