import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';

import type {
  AgentRef,
  CatalogCursor,
  CatalogPage,
  ConversationRef,
  ConversationListStatus,
} from './contracts';
import { useConversationSource, useConversationSourceState } from './ConversationSourceBoundary';
import { isRemoteConversationSource } from './remote/remoteContracts';

function useCatalog<T>(
  key: readonly string[],
  read: (cursor: CatalogCursor | undefined, signal: AbortSignal) => Promise<CatalogPage<T>>,
  enabled = true,
) {
  const kind = key[0] === 'selected-session' ? 'sessions' : key[0];
  const source = useConversationSource();
  const { availability } = useConversationSourceState();
  const queryClient = useQueryClient();
  const consumer = useId();
  // Workspace choices carry runtime refs. Metadata pages can survive a source release.
  const shared = kind !== 'workspaces';
  const queryKey = shared
    ? ['conversation-catalog', source.ref, source.catalog.cacheScope ?? source.scope, ...key]
    : ['conversation', source.scope, 'catalog', ...key, consumer];
  const serializedKey = JSON.stringify(queryKey);
  const retired =
    availability.state === 'disabled' &&
    ['retired', 'needs-repair', 'not-authorized'].includes(availability.reason);
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as CatalogCursor | undefined,
    queryFn: ({ pageParam, signal }) => read(pageParam, signal),
    getNextPageParam: (page) => page.next,
    enabled: enabled && availability.state === 'enabled',
    retry: false,
    gcTime: shared ? 5 * 60_000 : 0,
    staleTime: shared ? 30_000 : 0,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    const key = JSON.parse(serializedKey) as unknown[];
    const release = () => {
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.removeQueries({ queryKey: key, exact: true });
    };
    if (retired) {
      const retiredKey = shared ? key.slice(0, 3) : key;
      void queryClient.resetQueries({ queryKey: retiredKey });
      queryClient.removeQueries({
        queryKey: retiredKey,
        predicate: (entry) => entry.getObserversCount() === 0,
      });
    }
    // Query observers cancel only when the last reader exits; settled metadata stays cached.
    return shared ? undefined : release;
  }, [queryClient, serializedKey, retired, shared]);
  // A desktop source publishes applied starts as operations; the local catalog has none.
  useEffect(
    () =>
      isRemoteConversationSource(source)
        ? source.operations.subscribe(() => {
            if (
              kind === 'sessions' &&
              source.operations.getSnapshot().some((operation) => operation.state === 'applied')
            ) {
              void queryClient.invalidateQueries(
                {
                  queryKey: JSON.parse(serializedKey),
                  exact: true,
                },
                { cancelRefetch: false },
              );
            }
          })
        : undefined,
    [source, queryClient, kind, serializedKey],
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = source.catalog.subscribe?.((changed) => {
      if (changed !== kind) return;
      timer ??= setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries(
          { queryKey: JSON.parse(serializedKey), exact: true },
          { cancelRefetch: false },
        );
      }, 300);
    });
    return () => {
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [source, kind, queryClient, serializedKey]);
  return {
    ...query,
    data: retired ? undefined : query.data,
    items: retired ? [] : (query.data?.pages.flatMap((page) => page.items) ?? []),
  };
}

export function useConversationAgents() {
  const { catalog } = useConversationSource();
  return useCatalog(['agents'], catalog.listAgents);
}
export function useConversationSessions(agent?: AgentRef) {
  const { catalog } = useConversationSource();
  return useCatalog(['sessions', agent ?? ''], (cursor, signal) =>
    catalog.listSessions({ agent }, cursor, signal),
  );
}
export function useConversationWorkspaces(agent?: AgentRef) {
  const { catalog } = useConversationSource();
  return useCatalog(
    ['workspaces', agent ?? ''],
    (cursor, signal) =>
      agent && catalog.listWorkspaces
        ? catalog.listWorkspaces(agent, cursor, signal)
        : Promise.resolve({ items: [] }),
    Boolean(agent && catalog.listWorkspaces),
  );
}

const emptyStatus = {
  getSnapshot: (): ConversationListStatus | undefined => undefined,
  subscribe: () => () => {},
};

export function useConversationPreview(ref: ConversationRef) {
  const source = useConversationSource();
  const preview = useMemo(() => source.catalog.previewSession?.(ref) ?? {}, [source, ref]);
  const state = preview.status ?? emptyStatus;
  const status = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
  return { ...preview, status };
}

/** Reads metadata for the selected conversation only, never each visible row's history. */
export function useConversationSummary(sessionId?: string) {
  const source = useConversationSource();
  const query = useCatalog(
    ['selected-session', sessionId ?? ''],
    async (_cursor, signal) => ({
      items: [
        await source.catalog.readSession!({ source: source.ref, sessionId: sessionId! }, signal),
      ],
    }),
    Boolean(sessionId && source.catalog.readSession),
  );
  return { ...query, data: query.items[0] };
}
