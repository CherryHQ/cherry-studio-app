import { useInfiniteQuery } from '@tanstack/react-query';

import type { AgentController, ControllerSession } from '@/shared/contracts/agent/controller';

import { useRemoteAgent, useRemoteConnection } from './RemoteAgentProvider';

export function useRemoteAgents() {
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const query = useInfiniteQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, 'agents'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => controller.listAgents(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: connection.status === 'ready',
    retry: false,
  });
  const agents = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ).values(),
  ];
  return { ...query, agents };
}

type FeedCursor = Record<string, string | null>;
async function readSessionFeed(
  controller: AgentController,
  cursors: FeedCursor | undefined,
  signal: AbortSignal,
) {
  let pending = cursors;
  if (!pending) {
    pending = {};
    let cursor: string | undefined;
    do {
      const page = await controller.listAgents(cursor, signal);
      for (const agent of page.items) pending[agent.id] = '';
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  const next = { ...pending };
  const pages = await Promise.all(
    Object.entries(pending)
      .filter(([, cursor]) => cursor !== null)
      .map(async ([agentId, cursor]) => {
        const page = await controller.listSessions(agentId, cursor || undefined, signal);
        next[agentId] = page.nextCursor ?? null;
        return page.items;
      }),
  );
  return {
    items: pages.flat(),
    nextCursor: Object.values(next).some((cursor) => cursor !== null) ? next : undefined,
  };
}

export function useRemoteSessions(agentId?: string) {
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const query = useInfiniteQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, 'sessions', agentId ?? null],
    initialPageParam: undefined as string | FeedCursor | undefined,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<{ items: ControllerSession[]; nextCursor?: string | FeedCursor | null }> =>
      agentId
        ? controller.listSessions(
            agentId,
            typeof pageParam === 'string' ? pageParam : undefined,
            signal,
          )
        : readSessionFeed(
            controller,
            typeof pageParam === 'object' ? pageParam : undefined,
            signal,
          ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: connection.status === 'ready',
    retry: false,
  });
  const sessions = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ).values(),
  ];
  if (!agentId)
    sessions.sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));
  return { ...query, sessions };
}
