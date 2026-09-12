import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queryKeys, useMutation, useQuery } from '@/frontend/data';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';

const EMPTY_AGENT_TOOL_BINDINGS: readonly AgentToolBinding[] = Object.freeze([]);

export function useAgentToolBindingsApi(agentId: string | undefined) {
  const query = useQuery('/agents/:agentId/tool-bindings', {
    enabled: Boolean(agentId),
    params: { agentId: agentId ?? '' },
  });

  return {
    bindings: query.data?.items ?? EMPTY_AGENT_TOOL_BINDINGS,
    error: query.error,
    isLoading: query.isLoading,
    query,
    refetch: query.refetch,
  };
}

export function useAgentToolBindingMutations() {
  const queryClient = useQueryClient();
  const replaceMutation = useMutation('PUT', '/agents/:agentId/tool-bindings', {
    onError: async (_error, variables) => {
      const agentId = variables?.params.agentId;
      if (agentId) {
        await queryClient.invalidateQueries({
          exact: true,
          queryKey: queryKeys.agents.toolBindings(agentId),
        });
      }
    },
    onSuccess: (result, variables) => {
      const agentId = variables?.params.agentId;
      if (agentId) {
        queryClient.setQueryData(queryKeys.agents.toolBindings(agentId), result);
      }
    },
  });
  const replaceRequest = replaceMutation.trigger;

  const replaceAgentToolBindings = useCallback(
    (agentId: string, bindings: readonly WriteAgentToolBinding[]) => {
      if (!agentId) {
        throw new Error('replaceAgentToolBindings called with empty agent id');
      }
      return replaceRequest({ body: { bindings: [...bindings] }, params: { agentId } });
    },
    [replaceRequest],
  );

  return {
    isReplacing: replaceMutation.isLoading,
    replaceAgentToolBindings,
  };
}
