import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import type { AgentRef, CatalogCursor, CatalogPage } from './contracts';
import { useConversationSource, useConversationSourceState } from './ConversationSourceBoundary';

function useCatalog<T>(
  key: readonly string[],
  read: (cursor: CatalogCursor | undefined, signal: AbortSignal) => Promise<CatalogPage<T>>,
  enabled = true,
) {
  const kind = key[0];
  const source = useConversationSource();
  const { availability } = useConversationSourceState();
  const queryClient = useQueryClient();
  const consumer = useId();
  const queryKey = ['conversation', source.scope, 'catalog', ...key, consumer];
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
    gcTime: 0,
  });
  useEffect(() => {
    const key = JSON.parse(serializedKey) as string[];
    const release = () => {
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.removeQueries({ queryKey: key, exact: true });
    };
    if (retired) release();
    return release;
  }, [queryClient, serializedKey, retired]);
  useEffect(
    () =>
      source.operations.subscribe(() => {
        if (
          kind === 'sessions' &&
          source.operations.getSnapshot().some((operation) => operation.state === 'applied')
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['conversation', source.scope, 'catalog', 'sessions'],
          });
        }
      }),
    [source, queryClient, kind],
  );
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
