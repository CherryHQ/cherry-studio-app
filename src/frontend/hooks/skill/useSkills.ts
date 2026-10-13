import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useInfiniteQuery, useMutation, useQuery } from '@/frontend/data';
import { isSkillQuery } from '@/frontend/data/queryKeys/skills';
import type { AgentSkillUpdate, ListSkillsQueryParams } from '@/shared/data/api/schemas/skills';
import type { SkillListItem } from '@/shared/data/types/skill';

const EMPTY_SKILLS: readonly SkillListItem[] = Object.freeze([]);

export function useSkillsApi(
  query: Omit<ListSkillsQueryParams, 'limit'> & { limit?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const { limit, ...filters } = query;
  const result = useInfiniteQuery('/skills', {
    enabled: options.enabled,
    limit,
    query: filters,
    staleTime: 0,
  });
  return {
    error: result.error,
    isLoading: result.isLoading,
    refetch: result.refresh,
    skills: result.pages.flatMap((page) => page.items),
    hasNext: result.hasNext,
    loadNext: result.loadNext,
    isLoadingMore: result.isLoadingMore,
  };
}

export function useSkillApiById(skillId: string | undefined) {
  const result = useQuery('/skills/:skillId', {
    enabled: Boolean(skillId),
    params: { skillId: skillId ?? '' },
  });
  return {
    error: result.error,
    isLoading: result.isLoading,
    refetch: result.refetch,
    skill: result.data,
  };
}

export function useSkillInstructionsApi(skillId: string, enabled: boolean) {
  return useQuery('/skills/:skillId/instructions', {
    enabled,
    params: { skillId },
    staleTime: 0,
  });
}

export function useAgentSkillsApi(agentId: string | undefined) {
  const result = useQuery('/agents/:agentId/skills', {
    enabled: Boolean(agentId),
    params: { agentId: agentId ?? '' },
  });
  return {
    error: result.error,
    isLoading: result.isLoading,
    refetch: result.refetch,
    skills: result.data?.items ?? EMPTY_SKILLS,
  };
}

export function useSkillMutations() {
  const queryClient = useQueryClient();
  const bindingsMutation = useMutation('PUT', '/agents/:agentId/skills', {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: ({ queryKey }) => isSkillQuery(queryKey) });
    },
  });
  const triggerBindings = bindingsMutation.trigger;

  const replaceAgentSkills = useCallback(
    (agentId: string, updates: readonly AgentSkillUpdate[]) =>
      triggerBindings({ body: { updates: [...updates] }, params: { agentId } }),
    [triggerBindings],
  );

  return {
    isSavingBindings: bindingsMutation.isLoading,
    replaceAgentSkills,
  };
}
