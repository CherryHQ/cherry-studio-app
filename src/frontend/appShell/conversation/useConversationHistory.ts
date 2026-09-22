import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { useMessageRenderWindow } from '@/frontend/hooks/chat/useMessageRenderWindow';
import { getOlderLoadAction } from '@/frontend/hooks/chat/utils/messageHistoryWindowStrategy';

import type {
  ConversationMessage,
  ConversationSession,
  HistoryCursor,
  HistoryPage,
  HistoryVersion,
  HistoryWindow,
  MessageRef,
} from './contracts';
import { createConversationReferences, ConversationReadError } from './conversationState';
import { useConversationSnapshot } from './useConversation';

const RETIRED = new ConversationReadError({ code: 'retired', retry: 'none' });

export type ConversationHistoryView = {
  dataKey: string;
  messages: readonly ConversationMessage[];
  installedVersion?: HistoryVersion;
  error?: Error;
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  isLoadingNewer: boolean;
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  initialScrollTarget?: 'end' | { messageId: string };
  loadOlder(): Promise<void>;
  loadNewer(): Promise<void>;
  retry(): Promise<void>;
  returnToLatest?: () => void;
};

/** Query owns one fixed window and its reads; a key change keeps display values while replacing that window. */
export function useConversationHistory(
  session: ConversationSession | undefined,
  version: HistoryVersion | undefined,
  navigation?: { messageId: string; key: string },
): ConversationHistoryView {
  const queryClient = useQueryClient();
  const consumer = useId();
  const retired = useConversationSnapshot(session).freshness.state === 'retired';
  const [latestKey, setLatestKey] = useState<string>();
  const [retryGeneration, setRetryGeneration] = useState(0);
  const around = navigation && navigation.key !== latestKey ? navigation.messageId : undefined;
  const navigationKey = navigation?.key;
  const queryKey = useMemo(
    () =>
      [
        'conversation',
        session?.scope,
        session?.ref.sessionId,
        'history',
        consumer,
        version,
        around,
        navigationKey,
        retryGeneration,
        retired,
      ] as const,
    [session, consumer, version, around, navigationKey, retryGeneration, retired],
  );
  const readerKey = JSON.stringify(queryKey);
  const [owned, setOwned] = useState(() => ({
    key: readerKey,
    session,
    reader: createHistoryReader(session, around, version),
  }));
  let reader = owned.reader;
  if (owned.key !== readerKey || owned.session !== session) {
    reader = createHistoryReader(session, around, version);
    setOwned({ key: readerKey, session, reader });
  }
  useEffect(
    () => () => {
      reader.dispose();
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.removeQueries({ queryKey, exact: true });
    },
    [queryClient, queryKey, reader],
  );
  const query = useInfiniteQuery({
    queryKey,
    enabled: Boolean(session && !retired),
    initialPageParam: undefined as HistoryCursor | undefined,
    queryFn: ({ pageParam, signal }) => reader.read(pageParam, signal),
    getNextPageParam: (value) => value.page.older,
    getPreviousPageParam: (value) => value.page.newer,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    placeholderData: (previous, query) =>
      session && query?.queryKey[1] === session.scope && query.queryKey[2] === session.ref.sessionId
        ? previous
        : undefined,
  });
  const messages = useMemo(
    () => flattenHistory(query.data?.pages.map((value) => value.page) ?? []),
    [query.data],
  );
  const displays = useMemo(() => messages.map((message) => message.display), [messages]);
  const renderWindow = useMessageRenderWindow(displays);
  const { hasNextPage, hasPreviousPage, isFetching, fetchNextPage, fetchPreviousPage } = query;
  const loadOlder = useCallback(async () => {
    if (!around && getOlderLoadAction(renderWindow) === 'reveal') renderWindow.revealMore();
    else if (hasNextPage && !isFetching) await fetchNextPage({ cancelRefetch: false });
  }, [around, renderWindow, hasNextPage, isFetching, fetchNextPage]);
  const loadNewer = useCallback(async () => {
    if (hasPreviousPage && !isFetching) await fetchPreviousPage({ cancelRefetch: false });
  }, [hasPreviousPage, isFetching, fetchPreviousPage]);
  return {
    dataKey: JSON.stringify([session?.scope, session?.ref.sessionId, around, navigationKey]),
    messages: retired
      ? []
      : around
        ? messages
        : messages.slice(Math.max(0, messages.length - renderWindow.visibleMessages.length)),
    installedVersion: query.isPlaceholderData ? undefined : query.data?.pages[0]?.version,
    error: retired ? RETIRED : (query.error ?? undefined),
    isLoadingInitial: Boolean(session && !retired && query.isPending),
    isLoadingOlder: query.isFetchingNextPage,
    isLoadingNewer: query.isFetchingPreviousPage,
    hasOlderMessages: Boolean(query.hasNextPage || (!around && renderWindow.hasHiddenMessages)),
    hasNewerMessages: Boolean(around && (!query.data || query.hasPreviousPage)),
    initialScrollTarget: around
      ? {
          messageId: around,
        }
      : navigation
        ? 'end'
        : undefined,
    loadOlder,
    loadNewer,
    retry: async () => {
      setRetryGeneration((value) => value + 1);
    },
    ...(around ? { returnToLatest: () => setLatestKey(navigationKey) } : {}),
  };
}
export function flattenHistory(pages: readonly HistoryPage[]): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  const seen = new Set<string>();
  for (const page of pages.toReversed())
    for (const message of page.items) {
      if (!seen.has(message.key)) {
        seen.add(message.key);
        messages.push(message);
      }
    }
  return messages;
}

/** Query requests start read lifetimes lazily; construction during render never acquires resources. */
function createHistoryReader(
  session: ConversationSession | undefined,
  around: string | undefined,
  version: HistoryVersion | undefined,
) {
  let lifetime: AbortController | undefined;
  let window: HistoryWindow | undefined;
  return {
    async read(cursor: HistoryCursor | undefined, caller: AbortSignal) {
      caller.throwIfAborted();
      if (!session) throw new Error('Conversation session is not open');
      // A Query observer may reconnect after Strict Mode cleanup. Its next initial read owns a new lifetime.
      if (!lifetime) lifetime = new AbortController();
      const signal = AbortSignal.any([caller, lifetime.signal]);
      signal.throwIfAborted();
      if (!cursor) {
        const opened = await (around && session.history.openAround
          ? session.history.openAround(
              createConversationReferences(session.scope, session.ref.sessionId).issue<MessageRef>(
                'message',
                around,
              ),
              signal,
            )
          : session.history.openLatest(signal));
        if (signal.aborted) {
          opened.dispose();
          signal.throwIfAborted();
        }
        window?.dispose();
        window = opened;
        return { page: opened.initial, version };
      }
      if (!window) throw new Error('History window is not open');
      const page = await window.read(cursor, signal);
      signal.throwIfAborted();
      return { page, version };
    },
    dispose() {
      lifetime?.abort();
      lifetime = undefined;
      window?.dispose();
      window = undefined;
    },
  };
}
