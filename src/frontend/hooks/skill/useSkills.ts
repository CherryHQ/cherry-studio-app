import { useQuery as useTanStackQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  queryKeys,
  useBackendModule,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@/frontend/data';
import { isSkillQuery } from '@/frontend/data/queryKeys/skills';
import type { AgentSkillUpdate, ListSkillsQueryParams } from '@/shared/data/api/schemas/skills';
import type { SkillListItem } from '@/shared/data/types/skill';

const EMPTY_SKILLS: readonly SkillListItem[] = Object.freeze([]);

export function useSkillsApi(
  query: ListSkillsQueryParams = {},
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

export function useRecommendedSkills() {
  const skills = useBackendModule('skills');
  return useTanStackQuery({
    queryFn: () => skills.listRecommended(),
    queryKey: queryKeys.skills.recommended(),
    retry: false,
  });
}

export function useSkillMutations() {
  const queryClient = useQueryClient();
  const globalEnableMutation = useMutation('PATCH', '/skills/:skillId', {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: ({ queryKey }) => isSkillQuery(queryKey) });
    },
  });
  const bindingsMutation = useMutation('PUT', '/agents/:agentId/skills', {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: ({ queryKey }) => isSkillQuery(queryKey) });
    },
  });
  const triggerGlobal = globalEnableMutation.trigger;
  const triggerBindings = bindingsMutation.trigger;

  const setSkillGlobalEnabled = useCallback(
    (skillId: string, isGlobalEnabled: boolean) =>
      triggerGlobal({ body: { isGlobalEnabled }, params: { skillId } }),
    [triggerGlobal],
  );
  const replaceAgentSkills = useCallback(
    (agentId: string, updates: readonly AgentSkillUpdate[]) =>
      triggerBindings({ body: { updates: [...updates] }, params: { agentId } }),
    [triggerBindings],
  );

  return {
    isSavingBindings: bindingsMutation.isLoading,
    isSavingGlobal: globalEnableMutation.isLoading,
    replaceAgentSkills,
    setSkillGlobalEnabled,
  };
}
