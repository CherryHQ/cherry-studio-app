import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar } from '@/frontend/components/Avatar';

type ChatDraftStateProps = {
  assistantAvatarUri?: null | string;
  assistantName?: string;
  contentBottomInset: number;
};

/** Agent greeting shown before the first message is sent. */
export function ChatDraftState({
  assistantAvatarUri,
  assistantName,
  contentBottomInset,
}: ChatDraftStateProps) {
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: contentBottomInset }}
    >
      <View className="items-center gap-6">
        {assistantName ? (
          <AgentAvatar name={assistantName} size={48} uri={assistantAvatarUri} />
        ) : null}
        <Text className="text-center font-medium text-foreground text-xl" numberOfLines={2}>
          {t('chat.draft.greeting')}
        </Text>
      </View>
    </View>
  );
}
