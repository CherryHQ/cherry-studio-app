import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ChatWorkspaceFrame, FloatingChatInput, useFloatingChatInputLayout } from './workspace';

export function NewTopicScreen() {
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
        <Text
          className="mt-2 text-center text-default-foreground text-sm leading-5"
          numberOfLines={3}
        >
          {t('chat.newTopic.description')}
        </Text>
      </View>
      <FloatingChatInput onHeightChange={handleInputHeightChange} />
    </ChatWorkspaceFrame>
  );
}
