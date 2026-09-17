import { Surface } from '@cherrystudio/ui/components';
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

  return { agent, currentAgentId, openNewSession };
}

export function MainHeaderAgentButton({ agent, onPress }: { agent: Agent; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={agent.name}
      accessibilityRole="button"
      className="max-w-56 min-w-0 shrink rounded-full shadow-xs active:opacity-60"
      hitSlop={8}
      onPress={onPress}
      testID="current-agent-button"
    >
      <Surface interactive shape="pill">
        <View className="min-h-10 min-w-0 flex-row items-center gap-2 px-3 py-1.5">
          <AgentAvatar avatar={agent.avatar} name={agent.name} size={28} uri={agent.avatarUri} />
          <Text
            className="min-w-0 shrink font-semibold text-base text-foreground"
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
          >
            {agent.name}
          </Text>
        </View>
      </Surface>
    </Pressable>
  );
}
