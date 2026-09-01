import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAgentSession, useAgentsApi } from '@/frontend/hooks/agent';

import { type ChatRouteParamsInput, chatRouteParams, parseChatRoute } from './chatRoute';

/** Opens a draft for the current available Agent, then falls back to the first Agent. */
export function useStartNewChat() {
  const router = useRouter();
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);
  const target = route.status === 'ready' ? route.target : undefined;
  const currentSession = useAgentSession(target?.kind === 'session' ? target.sessionId : undefined);
  const currentAgentId = target?.kind === 'draft' ? target.agentId : currentSession.data?.agentId;
  const { agents, isLoading, refetch } = useAgentsApi();

  return useCallback(async () => {
    const refetchResult = isLoading ? await refetch() : undefined;
    const availableAgents = refetchResult?.data?.items ?? agents;
    const currentAgent = availableAgents.find((agent) => agent.id === currentAgentId);
    const agentId = currentAgent?.id ?? availableAgents[0]?.id;

    if (!agentId) {
      router.push('/agents');
      return;
    }

    router.setParams(chatRouteParams({ agentId, kind: 'draft' }));
  }, [agents, currentAgentId, isLoading, refetch, router]);
}
