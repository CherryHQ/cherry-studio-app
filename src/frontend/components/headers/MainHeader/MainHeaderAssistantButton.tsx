import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';

import { useAssistantApiById, useTopic } from '@/frontend/hooks/chat';

export function useMainHeaderAssistant() {
  const router = useRouter();
  const { assistantId, topicId } = useLocalSearchParams<{
    assistantId?: string;
    topicId?: string;
  }>();
  const topic = useTopic(topicId);
  const currentAssistantId = topicId ? topic.data?.assistantId : assistantId;
  const { assistant } = useAssistantApiById(currentAssistantId);

  const openNewTopic = useCallback(() => {
    router.setParams({ assistantId: currentAssistantId, topicId: undefined });
  }, [currentAssistantId, router]);
  const openAssistant = useCallback(() => {
    if (!assistant) {
      return;
    }

    router.push({
      params: { assistantId: assistant.id },
      pathname: '/assistants/[assistantId]/edit',
    });
  }, [assistant, router]);

  return { assistant, openAssistant, openNewTopic };
}

export function MainHeaderAssistantButton({
  assistant,
  onPress,
}: {
  assistant: Assistant;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={assistant.name}
      accessibilityRole="button"
      className="size-10 items-center justify-center overflow-hidden rounded-full bg-secondary active:opacity-60"
      hitSlop={8}
      onPress={onPress}
      testID="current-assistant-button"
    >
      <Text className="text-emoji-xl">{assistant.emoji}</Text>
    </Pressable>
  );
}
