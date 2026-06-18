import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { Assistant } from '@/data/types/assistant';
import { useAssistantApiById } from '@/hooks/chat';

import { ChatWorkspaceFrame, FloatingChatInput, useFloatingChatInputLayout } from './workspace';

export function NewTopicScreen() {
  const { t } = useTranslation();
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(null);
  const { assistant } = useAssistantApiById(pendingAssistantId ?? undefined);
  const { contentBottomInset, handleInputHeightChange } = useFloatingChatInputLayout();
  const welcome = getNewTopicWelcome({
    assistant,
    defaultDescription: t('chat.newTopic.description'),
    defaultTitle: t('chat.newTopic.title'),
    fallbackAssistantDescription: t('chat.newTopic.assistantDescription', {
      name: assistant?.name ?? '',
    }),
  });

  return (
    <ChatWorkspaceFrame>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ paddingBottom: contentBottomInset }}
      >
        <Text className="text-center font-semibold text-foreground text-lg">{welcome.title}</Text>
        <Text
          className="mt-2 text-center text-default-foreground text-sm leading-5"
          numberOfLines={3}
        >
          {welcome.description}
        </Text>
      </View>
      <FloatingChatInput
        pendingAssistantId={pendingAssistantId}
        onHeightChange={handleInputHeightChange}
        onPendingAssistantChange={setPendingAssistantId}
      />
    </ChatWorkspaceFrame>
  );
}

function getNewTopicWelcome({
  assistant,
  defaultDescription,
  defaultTitle,
  fallbackAssistantDescription,
}: {
  assistant?: Assistant;
  defaultDescription: string;
  defaultTitle: string;
  fallbackAssistantDescription: string;
}) {
  if (!assistant) {
    return {
      description: defaultDescription,
      title: defaultTitle,
    };
  }

  return {
    description: assistant.description || fallbackAssistantDescription,
    title: `${assistant.emoji || '🌟'} ${assistant.name}`,
  };
}
