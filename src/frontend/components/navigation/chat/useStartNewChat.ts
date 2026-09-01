import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { usePreference } from '@/frontend/data/hooks';
import { useAgentsApi } from '@/frontend/hooks/agent';

import { chatRouteParams, parseStoredChatTarget } from './chatRoute';

/** Opens a draft for the last available Agent, then falls back to the first Agent. */
export function useStartNewChat() {
  const router = useRouter();
  const [storedTargetValue] = usePreference('chat.last_active_target');
  const { agents, isLoading, refetch } = useAgentsApi();

  return useCallback(async () => {
    const refetchResult = isLoading ? await refetch() : undefined;
    const availableAgents = refetchResult?.data?.items ?? agents;
    const storedAgentId = parseStoredChatTarget(storedTargetValue)?.agentId;
    const storedAgent = availableAgents.find((agent) => agent.id === storedAgentId);
    const agentId = storedAgent?.id ?? availableAgents[0]?.id;

    if (!agentId) {
      router.push('/agents');
      return;
    }

    router.setParams(chatRouteParams({ agentId, kind: 'draft' }));
  }, [agents, isLoading, refetch, router, storedTargetValue]);
}
