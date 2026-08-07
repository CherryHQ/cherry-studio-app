import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ChatComposer, ChatWorkspaceFrame, useFloatingChatInputLayout } from './workspace';

/** `assistantId` binds the topic this screen creates to that assistant. */
export function NewTopicScreen({ assistantId }: { assistantId?: string }) {
  const { t } = useTranslation();
  const { contentBottomInset, handleInputHeightChange } = useFloatingChatInputLayout();

  return (
    <ChatWorkspaceFrame>
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ paddingBottom: contentBottomInset }}
      >
        <Text className="text-center font-semibold text-foreground text-lg">
          {t('chat.newTopic.title')}
        </Text>
        <Text className="mt-2 text-center text-foreground text-sm" numberOfLines={3}>
          {t('chat.newTopic.description')}
        </Text>
      </View>
      <ChatComposer assistantId={assistantId} onHeightChange={handleInputHeightChange} />
    </ChatWorkspaceFrame>
  );
}
