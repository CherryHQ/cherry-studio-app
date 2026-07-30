import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useBackendModule } from '@/frontend/data';
import type { BranchMessagesResponse, Message } from '@/shared/data/types/message';
import { useMessageRenderWindow } from './useMessageRenderWindow';
import {
  getOlderLoadAction,
  shouldPrefetchOlderMessages,
} from './utils/messageHistoryWindowStrategy';
import {
  fetchTopicMessagesPage,
  getMessagesQueryKey,
  getNextMessagesPageParam,
  type MessagesQueryKey,
} from './utils/messageQueryOptions';

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

function flattenMessagePages(
  data: InfiniteData<BranchMessagesResponse, string | undefined> | undefined,
) {
  const pages = data?.pages ?? [];
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
  const chat = useBackendModule('chat');
  const enabled = options.enabled && Boolean(topicId);
  const queryTopicId = topicId ?? '__missing_topic__';

  const query = useInfiniteQuery<
    BranchMessagesResponse,
    Error,
    InfiniteData<BranchMessagesResponse, string | undefined>,
    MessagesQueryKey,
    string | undefined
  >({
    enabled,
    getNextPageParam: getNextMessagesPageParam,
    initialPageParam: undefined,
    queryFn: (context) => fetchTopicMessagesPage(chat, queryTopicId, context),
    queryKey: getMessagesQueryKey(queryTopicId),
  });

  const allMessages = useMemo(() => flattenMessagePages(query.data), [query.data]);
  const { hasHiddenMessages, hiddenMessageCount, revealMore, visibleMessages } =
    useMessageRenderWindow(allMessages);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
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

      if (!hasNextPage || isFetchingNextPage) {
        return;
      }

      const fetchPromise = fetchNextPage().then(() => undefined);
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
    [fetchNextPage, hasNextPage, isFetchingNextPage],
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
