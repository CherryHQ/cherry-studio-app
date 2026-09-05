import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useMutation, useQuery } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromCountedList,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import type {
  CreateAgentDto,
  DeleteAgentResult,
  UpdateAgentDto,
} from '@/shared/data/api/schemas/agents';
import { AGENTS_MAX_LIMIT } from '@/shared/data/api/schemas/agents';
import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import type { Agent } from '@/shared/data/types/agent';

const EMPTY_AGENTS: readonly Agent[] = Object.freeze([]);
type AgentListData = OffsetPaginationResponse<Agent>;

export function useAgentsApi(options: { enabled?: boolean } = {}) {
  const query = useQuery('/agents', {
    enabled: options.enabled,
    query: { limit: AGENTS_MAX_LIMIT },
  });

  return {
    agents: query.data?.items ?? EMPTY_AGENTS,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useAgentApiById(id: string | undefined) {
  const enabled = Boolean(id);
  const query = useQuery('/agents/:id', {
    enabled,
    params: { id: id ?? '' },
  });

  return {
    agent: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useAgentMutations() {
  const queryClient = useQueryClient();
  const createMutation = useMutation('POST', '/agents', {
    refresh: ['/agents'],
  });
  const updateMutation = useMutation('PATCH', '/agents/:id', {
    refresh: ({ args }) => ['/agents', ...(args ? [`/agents/${args.params.id}`] : [])],
  });
  const deleteMutation = useMutation('DELETE', '/agents/:id');
  const setAvatarMutation = useMutation('PUT', '/agents/:id/avatar', {
    refresh: ({ args }) => ['/agents', ...(args ? [`/agents/${args.params.id}`] : [])],
  });
  const createAgentRequest = createMutation.trigger;
  const updateAgentRequest = updateMutation.trigger;
  const deleteAgentRequest = deleteMutation.trigger;
  const setAgentAvatarRequest = setAvatarMutation.trigger;

  const createAgent = useCallback(
    (dto: CreateAgentDto) => createAgentRequest({ body: dto }),
    [createAgentRequest],
  );

  const updateAgent = useCallback(
    (id: string, patch: UpdateAgentDto) => {
      if (!id) {
        throw new Error('updateAgent called with empty id');
      }
      return updateAgentRequest({ body: patch, params: { id } });
    },
    [updateAgentRequest],
  );

  /**
   * The avatar is a managed file, not a mutable agent field, so it has its own
   * endpoint and is written after the record exists — on create that means
   * after the POST returns an id.
   */
  const setAgentAvatar = useCallback(
    (id: string, sourceUri: string) => {
      if (!id) {
        throw new Error('setAgentAvatar called with empty id');
      }
      return setAgentAvatarRequest({ body: { sourceUri }, params: { id } });
    },
    [setAgentAvatarRequest],
  );

  const deleteAgents = useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return [];
      }

      const idSet = new Set(uniqueIds);
      const snapshot = await updateQueriesOptimistically<AgentListData>(
        queryClient,
        dataApiCollectionFilters('/agents'),
        (current) => removeItemsFromCountedList(current, idSet),
      );
      const results = await Promise.allSettled(
        uniqueIds.map((id) => deleteAgentRequest({ params: { id } })),
      );
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          queryClient.removeQueries({ queryKey: [`/agents/${uniqueIds[index]}`] });
        }
      }

      if (firstFailure) {
        restoreQuerySnapshot(queryClient, snapshot);
      }

      await queryClient.invalidateQueries({ queryKey: ['/agents'] });

      if (firstFailure) {
        throw firstFailure.reason;
      }

      return results.map((result) => (result as PromiseFulfilledResult<DeleteAgentResult>).value);
    },
    [deleteAgentRequest, queryClient],
  );

  const deleteAgent = useCallback(
    async (id: string): Promise<DeleteAgentResult> => {
      const [result] = await deleteAgents([id]);
      return result;
    },
    [deleteAgents],
  );

  return {
    createAgent,
    updateAgent,
    setAgentAvatar,
    deleteAgent,
    deleteAgents,
    isCreating: createMutation.isLoading,
    isUpdating: updateMutation.isLoading,
    isSettingAvatar: setAvatarMutation.isLoading,
    isDeleting: deleteMutation.isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
