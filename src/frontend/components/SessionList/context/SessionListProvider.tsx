import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useCallback, useMemo } from 'react';

import { queryKeys, useMutation } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  restoreQuerySnapshot,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import { useAgentSessionMutations, useAgentSessions } from '@/frontend/hooks/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

type SessionListData = InfiniteData<
  CursorPaginationResponse<AgentSessionEntity>,
  string | undefined
>;

type SessionListProviderProps = PropsWithChildren<{
  agentId?: string;
}>;

type SessionListSessionsContextValue = {
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;
  isSessionListLoading: boolean;
  sessionQueryError?: Error;
  sessions: readonly AgentSessionEntity[];
};

type SessionListActionsContextValue = {
  deleteSession: (sessionId: string) => Promise<void>;
  deleteSessions: (sessionIds: readonly string[]) => Promise<void>;
  loadMoreSessions: () => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
};

const SessionListSessionsContext = createContext<SessionListSessionsContextValue | null>(null);
const SessionListActionsContext = createContext<SessionListActionsContextValue | null>(null);

export function SessionListProvider({ agentId, children }: SessionListProviderProps) {
  const queryClient = useQueryClient();
  const sessionList = useAgentSessions({ agentId });
  const { deleteAgentSession, deleteAgentSessions } = useAgentSessionMutations();

  const renameSessionMutation = useMutation('PATCH', '/agent-sessions/:id', {
    onMutate: async (variables) => {
      const id = variables?.params.id;
      const title = variables?.body?.title;
      if (!id || !title) {
        return {};
      }

      const sessionFilters = dataApiCollectionFilters('/agent-sessions');
      const detailFilters = { exact: true, queryKey: queryKeys.agentSessions.detail(id) };
      await Promise.all([
        queryClient.cancelQueries(sessionFilters),
        queryClient.cancelQueries(detailFilters),
      ]);
      const sessions = queryClient.getQueriesData<SessionListData>(sessionFilters);
      const detail = queryClient.getQueriesData<AgentSessionEntity>(detailFilters);

      try {
        queryClient.setQueriesData<SessionListData>(sessionFilters, (current) =>
          renameSessionInInfiniteData(current, id, title),
        );
        queryClient.setQueriesData<AgentSessionEntity>(detailFilters, (current) =>
          current ? { ...current, title, titleIsManual: true } : current,
        );
      } catch (error) {
        restoreQuerySnapshot(queryClient, sessions);
        restoreQuerySnapshot(queryClient, detail);
        throw error;
      }

      return { detail, sessions };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.sessions);
      restoreQuerySnapshot(queryClient, context?.detail);
    },
    refresh: ({ args }) => [
      '/agent-sessions',
      ...(args ? [`/agent-sessions/${args.params.id}`] : []),
    ],
  });
  const updateSession = renameSessionMutation.trigger;

  const renameSession = useCallback(
    async (id: string, title: string) => {
      const trimmedTitle = title.trim();

      if (!trimmedTitle) {
        return;
      }

      await updateSession({ body: { title: trimmedTitle }, params: { id } });
    },
    [updateSession],
  );

  const sessionsValue = useMemo(
    () => ({
      hasMoreSessions: sessionList.hasMore,
      isLoadingMoreSessions: sessionList.isLoadingMore,
      isSessionListLoading: sessionList.isLoadingInitial,
      sessionQueryError: sessionList.error,
      sessions: sessionList.sessions,
    }),
    [
      sessionList.error,
      sessionList.hasMore,
      sessionList.isLoadingInitial,
      sessionList.isLoadingMore,
      sessionList.sessions,
    ],
  );
  const actionsValue = useMemo(
    () => ({
      deleteSession: deleteAgentSession,
      deleteSessions: deleteAgentSessions,
      loadMoreSessions: sessionList.loadMore,
      renameSession,
    }),
    [deleteAgentSession, deleteAgentSessions, renameSession, sessionList.loadMore],
  );

  return (
    <SessionListSessionsContext value={sessionsValue}>
      <SessionListActionsContext value={actionsValue}>{children}</SessionListActionsContext>
    </SessionListSessionsContext>
  );
}

export function useSessionListSessions() {
  const context = use(SessionListSessionsContext);

  if (!context) {
    throw new Error('useSessionListSessions must be used within a SessionListProvider');
  }

  return context;
}

export function useSessionListActions() {
  const context = use(SessionListActionsContext);

  if (!context) {
    throw new Error('useSessionListActions must be used within a SessionListProvider');
  }

  return context;
}

function renameSessionInInfiniteData(
  current: SessionListData | undefined,
  sessionId: string,
  title: string,
): SessionListData | undefined {
  if (!current) {
    return current;
  }

  let changed = false;
  const pages = current.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }

      changed = true;
      pageChanged = true;
      return { ...session, title, titleIsManual: true };
    });

    return pageChanged ? { ...page, items } : page;
  });

  return changed ? { ...current, pages } : current;
}
