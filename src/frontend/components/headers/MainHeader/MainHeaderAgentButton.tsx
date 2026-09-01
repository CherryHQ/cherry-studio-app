import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';

import {
  type ChatRouteParamsInput,
  chatRouteParams,
  parseChatRoute,
  useStartNewChat,
} from '@/frontend/components/navigation/chat';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

const AGENT_NAME_MINIMUM_FONT_SCALE = 12 / 14;

export function useMainHeaderAgent() {
  const router = useRouter();
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);
  const routeTarget = route.status === 'ready' ? route.target : undefined;
  const routeAgentId = routeTarget?.kind === 'draft' ? routeTarget.agentId : undefined;
  const sessionId = routeTarget?.kind === 'session' ? routeTarget.sessionId : undefined;
  const session = useAgentSession(sessionId);
  const currentAgentId = session.data?.agentId ?? routeAgentId;
  const { agent } = useAgentApiById(currentAgentId);
  const startNewChat = useStartNewChat();

  const openAgentHistory = useCallback(() => {
    if (!currentAgentId) {
      return;
    }

    router.push({
      params: { agentId: currentAgentId },
      pathname: '/sessions',
    });
  }, [currentAgentId, router]);
  const openNewSession = useCallback(() => {
    if (agent) {
      router.setParams(chatRouteParams({ agentId: agent.id, kind: 'draft' }));
      return;
    }

    void startNewChat();
  }, [agent, router, startNewChat]);

  return { agent, currentAgentId, openAgentHistory, openNewSession };
}

export function MainHeaderAgentButton({ agent, onPress }: { agent: Agent; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={agent.name}
      accessibilityRole="button"
      className="h-10 max-w-56 min-w-0 shrink flex-row items-center justify-center gap-1 rounded-full px-3 active:bg-secondary"
      hitSlop={8}
      onPress={onPress}
      testID="current-agent-button"
    >
      <Text
        adjustsFontSizeToFit
        className="min-w-0 shrink text-center font-semibold text-foreground text-sm"
        ellipsizeMode="clip"
        maxFontSizeMultiplier={1.2}
        minimumFontScale={AGENT_NAME_MINIMUM_FONT_SCALE}
        numberOfLines={1}
      >
        {agent.name}
      </Text>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
    </Pressable>
  );
}
