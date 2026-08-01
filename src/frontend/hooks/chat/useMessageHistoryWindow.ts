import { useCallback, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@/frontend/data';
import type { BranchMessagesResponse, Message } from '@cherrystudio/shared/data/types/message';
import { useMessageRenderWindow } from './useMessageRenderWindow';
import {
  getOlderLoadAction,
  shouldPrefetchOlderMessages,
} from './utils/messageHistoryWindowStrategy';
import { initialMessagesPageSize } from './utils/messageQueryOptions';

export type MessageHistoryWindowOptions = {
  enabled: boolean;
};

export type MessageHistoryWindow = {
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => Promise<void>;
  messages: readonly Message[];
  prefetchOlder: () => void;
};

type OlderFetchOptions = {
  showLoading: boolean;
};

function flattenMessagePages(pages: readonly BranchMessagesResponse[]) {
  const messages: Message[] = [];

  for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex -= 1) {
    for (const { message } of pages[pageIndex].items) {
      if (message.role !== 'system') {
        messages.push(message);
      }
    }
  }

  return messages;
}

export function useMessageHistoryWindow(
  topicId: string | undefined,
  options: MessageHistoryWindowOptions,
): MessageHistoryWindow {
  const enabled = options.enabled && Boolean(topicId);
  const queryTopicId = topicId ?? '__missing_topic__';

  const query = useInfiniteQuery('/topics/:topicId/messages', {
    enabled,
    limit: initialMessagesPageSize,
    params: { topicId: queryTopicId },
  });

  const allMessages = useMemo(() => flattenMessagePages(query.pages), [query.pages]);
  const { hasHiddenMessages, hiddenMessageCount, revealMore, visibleMessages } =
    useMessageRenderWindow(allMessages);
  const { hasNext, isLoadingMore, loadNext } = query;
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

  const prefetchOlder = useCallback(() => {
    if (!shouldPrefetchOlderMessages({ hasHiddenMessages, hiddenMessageCount })) {
      return;
    }

    void fetchOlderIfNeeded({ showLoading: false });
  }, [fetchOlderIfNeeded, hasHiddenMessages, hiddenMessageCount]);

  return {
    isLoadingInitial: query.isLoading,
    isLoadingOlder,
    loadOlder,
    messages: visibleMessages,
    prefetchOlder,
  };
}
