import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useInfiniteQuery, useMutation, useQuery } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromInfiniteData,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import type {
  AgentSessionEntity,
  UpdateAgentSessionDto,
} from '@/shared/data/api/schemas/agentSessions';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

export type AgentSessionsOptions = {
  agentId?: string;
};

export type LatestAgentSessionOptions = AgentSessionsOptions & {
  enabled?: boolean;
};

export type AgentSessionsViewModel = {
  error?: Error;
  hasMore: boolean;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  sessions: readonly AgentSessionEntity[];
};

type AgentSessionListData = InfiniteData<CursorPaginationResponse<AgentSessionEntity>>;

const defaultPageSize = 50;

export function useAgentSessions(options: AgentSessionsOptions = {}): AgentSessionsViewModel {
  const query = useInfiniteQuery('/agent-sessions', {
    limit: defaultPageSize,
    query: { agentId: options.agentId },
  });

  const sessions = useMemo(() => query.pages.flatMap((page) => page.items), [query.pages]);

  return {
    error: query.error,
    hasMore: query.hasNext,
    isLoadingInitial: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    loadMore: query.loadNext,
    sessions,
  };
}

export function useAgentSession(sessionId: string | undefined) {
  return useQuery('/agent-sessions/:id', {
    enabled: Boolean(sessionId),
    params: { id: sessionId ?? '' },
  });
}

export function useLatestAgentSession(options: LatestAgentSessionOptions = {}) {
  const query = useInfiniteQuery('/agent-sessions', {
    enabled: options.enabled,
    gcTime: 0,
    limit: 1,
    query: { agentId: options.agentId },
    refetchOnMount: 'always',
  });

  return {
    error: query.error,
    isLoading: query.isLoading,
    isRefreshing: query.isRefreshing,
    refetch: query.refresh,
    session: query.pages.at(0)?.items.at(0),
  };
}

export function useAgentSessionMutations() {
  const queryClient = useQueryClient();
  const updateMutation = useMutation('PATCH', '/agent-sessions/:id', {
    refresh: ({ args }) => [
      '/agent-sessions',
      ...(args ? [`/agent-sessions/${args.params.id}`] : []),
    ],
  });
  const deleteMutation = useMutation('DELETE', '/agent-sessions/:id');
  const updateSessionRequest = updateMutation.trigger;
  const deleteSessionRequest = deleteMutation.trigger;

  const updateAgentSession = useCallback(
    (id: string, patch: UpdateAgentSessionDto) => {
      if (!id) {
        throw new Error('updateAgentSession called with empty id');
      }
      return updateSessionRequest({ body: patch, params: { id } });
    },
    [updateSessionRequest],
  );

  const deleteAgentSessions = useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      const idSet = new Set(uniqueIds);
      const snapshot = await updateQueriesOptimistically<AgentSessionListData>(
        queryClient,
        dataApiCollectionFilters('/agent-sessions'),
        (current) => removeItemsFromInfiniteData(current, idSet),
      );
      const results = await Promise.allSettled(
        uniqueIds.map((id) => deleteSessionRequest({ params: { id } })),
      );
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          const id = uniqueIds[index];
          queryClient.removeQueries({ queryKey: [`/agent-sessions/${id}`] });
          queryClient.removeQueries({ queryKey: [`/agent-sessions/${id}/messages`] });
        }
      }

      if (firstFailure) {
        restoreQuerySnapshot(queryClient, snapshot);
      }

      await queryClient.invalidateQueries({ queryKey: ['/agent-sessions'] });

      if (firstFailure) {
        throw firstFailure.reason;
      }
    },
    [deleteSessionRequest, queryClient],
  );

  const deleteAgentSession = useCallback(
    (id: string) => deleteAgentSessions([id]),
    [deleteAgentSessions],
  );

  return {
    updateAgentSession,
    deleteAgentSession,
    deleteAgentSessions,
    isUpdating: updateMutation.isLoading,
    isDeleting: deleteMutation.isLoading,
    updateMutation,
    deleteMutation,
  };
}
