import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';

import {
  type ChatRouteParamsInput,
  chatRouteParams,
  parseChatRoute,
  useStartNewChat,
} from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

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

  const openNewSession = useCallback(() => {
    Keyboard.dismiss();
    if (agent) {
      router.setParams(chatRouteParams({ agentId: agent.id, kind: 'draft' }));
      return;
    }

    void startNewChat();
  }, [agent, router, startNewChat]);

  return { agent, openNewSession };
}

export function MainHeaderAgentLabel({
  agent,
  onPress,
}: {
  onPress?: () => void;
  agent: Pick<Agent, 'name'> & Partial<Pick<Agent, 'avatar' | 'avatarUri'>> & { emoji?: string };
}) {
  const Container = onPress ? Pressable : View;
  return (
    <Container
      accessible
      accessibilityLabel={agent.name}
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      hitSlop={onPress ? 8 : undefined}
      className={`min-h-10 max-w-56 min-w-0 shrink flex-row items-center gap-2 rounded-full px-3 py-1${onPress ? ' active:opacity-60' : ''}`}
      testID="current-agent-label"
    >
      <AgentAvatar
        avatar={agent.avatar}
        emoji={agent.emoji}
        name={agent.name}
        size={24}
        uri={agent.avatarUri}
      />
      <Text
        className="min-w-0 shrink font-medium text-base text-foreground"
        ellipsizeMode="tail"
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
      >
        {agent.name}
      </Text>
    </Container>
  );
}
