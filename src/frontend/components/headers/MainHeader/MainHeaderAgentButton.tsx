import BotIcon from '@cherrystudio/app-icons/icons/bot';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

import { HeaderIconButton } from '../components/HeaderAction/HeaderIconButton';

export function useMainHeaderAgent() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    sessionId?: string | string[];
  }>();
  const routeAgentId = getSingleParamValue(params.agentId);
  const sessionId = getSingleParamValue(params.sessionId);
  const session = useAgentSession(sessionId);
  const currentAgentId = session.data?.agentId ?? routeAgentId;
  const { agent } = useAgentApiById(currentAgentId);

  const openNewSession = useCallback(() => {
    if (!agent) {
      router.push('/agents');
      return;
    }
    router.setParams({ agentId: agent.id, sessionId: undefined });
  }, [agent, router]);
  const openAgent = useCallback(() => {
    if (!agent) {
      return;
    }
    router.push({
      params: { agentId: agent.id },
      pathname: '/agents/[agentId]/edit',
    });
  }, [agent, router]);

  return { agent, openAgent, openNewSession };
}

export function MainHeaderAgentButton({ agent, onPress }: { agent: Agent; onPress: () => void }) {
  return (
    <HeaderIconButton
      accessibilityLabel={agent.name}
      className="overflow-hidden"
      onPress={onPress}
      testID="current-agent-button"
    >
      <BotIcon className="size-5 text-foreground" />
    </HeaderIconButton>
  );
}

function getSingleParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}
