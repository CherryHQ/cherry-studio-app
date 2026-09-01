import { useCallback, useMemo, useRef, useState } from 'react';

import { useInfiniteQuery } from '@/frontend/data';
import { useMessageRenderWindow } from '@/frontend/hooks/chat/useMessageRenderWindow';
import { getOlderLoadAction } from '@/frontend/hooks/chat/utils/messageHistoryWindowStrategy';
import { messageWindowPolicy } from '@/frontend/hooks/chat/utils/messageWindowPolicy';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export type AgentMessageHistoryWindow = {
  error?: Error;
  /**
   * True once the window holds the whole transcript, so a caller may render
   * something that claims to sit above the first message.
   */
  isAtHistoryStart: boolean;
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => Promise<void>;
  messages: readonly AgentMessageView[];
  retry: () => Promise<void>;
};

type OlderFetchOptions = {
  showLoading: boolean;
};

type ActiveOlderFetch = {
  promise: Promise<void>;
  sessionId: string | undefined;
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
  const { error, hasNext, isLoading, isLoadingMore, loadNext, pages, refresh } = query;
  const allMessages = useMemo(() => flattenMessagePages(pages), [pages]);
  const { hasHiddenMessages, hiddenMessageCount, revealMore, visibleMessages } =
    useMessageRenderWindow(allMessages);
  const activeOlderFetchRef = useRef<ActiveOlderFetch | null>(null);
  const [loadingOlderSessionId, setLoadingOlderSessionId] = useState<string>();

  const fetchOlderIfNeeded = useCallback(
    async (fetchOptions: OlderFetchOptions) => {
      const activeFetch = activeOlderFetchRef.current;
      if (activeFetch && activeFetch.sessionId === sessionId) {
        if (fetchOptions.showLoading) {
          const activePromise = activeFetch.promise;
          setLoadingOlderSessionId(sessionId);
          await activePromise.finally(() => {
            setLoadingOlderSessionId((current) => (current === sessionId ? undefined : current));
          });
        }
        return;
      }

      if (!hasNext || isLoadingMore) {
        return;
      }

      const fetchPromise = loadNext();
      activeOlderFetchRef.current = { promise: fetchPromise, sessionId };
      if (fetchOptions.showLoading) {
        setLoadingOlderSessionId(sessionId);
      }

      await fetchPromise.finally(() => {
        if (activeOlderFetchRef.current?.promise === fetchPromise) {
          activeOlderFetchRef.current = null;
        }
        if (fetchOptions.showLoading) {
          setLoadingOlderSessionId((current) => (current === sessionId ? undefined : current));
        }
      });
    },
    [hasNext, isLoadingMore, loadNext, sessionId],
  );

  const loadOlder = useCallback(async () => {
    const action = getOlderLoadAction({ hasHiddenMessages, hiddenMessageCount });
    if (action === 'reveal') {
      revealMore();
      return;
    }
    await fetchOlderIfNeeded({ showLoading: true });
  }, [fetchOlderIfNeeded, hasHiddenMessages, hiddenMessageCount, revealMore]);
  const retry = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return {
    error,
    // Both gates matter: an unfetched page and a withheld render page are
    // equally "there is more above this".
    isAtHistoryStart: !hasNext && !hasHiddenMessages && !isLoading,
    isLoadingInitial: isLoading,
    isLoadingOlder: loadingOlderSessionId === sessionId,
    loadOlder,
    messages: visibleMessages,
    retry,
  };
}

export const __testing = { flattenMessagePages };
