import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';

import { useAssistantApiById, useTopic } from '@/frontend/hooks/chat';
import type { Assistant } from '@/shared/data/types/assistant';

export function useMainHeaderAssistant() {
  const router = useRouter();
  const { assistantId, topicId } = useLocalSearchParams<{
    assistantId?: string;
    topicId?: string;
  }>();
  const topic = useTopic(topicId);
  // 话题一旦解析出来就以它为准，但在那之前**不放弃 URL 上还带着的 assistantId**。
  // 硬切（`topicId ? topic.data?.assistantId : assistantId`）会让助手按钮在话题加载完之前
  // 变成 null：新话题发出第一条消息时导航先于话题可读，按钮因此整个消失再回来，iOS 上
  // toolbar 的 children 数量从 2 掉到 1，两个按钮一起走原生重建（实测淡出再淡入 600ms）。
  //
  // 回落值不会是别的助手：`open-topic` 走 `setParams({ topicId })`，assistantId 原样留在
  // URL 上且就是这个话题的助手；而从话题列表进来那条路带的 params 只有 topicId，回落到
  // undefined，与从前一致。
  const currentAssistantId = (topicId ? topic.data?.assistantId : undefined) ?? assistantId;
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
