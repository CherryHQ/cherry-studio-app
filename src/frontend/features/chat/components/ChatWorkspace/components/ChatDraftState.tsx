import { useComposerExpansion } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { AgentAvatar } from '@/frontend/components/Avatar';

type ChatDraftStateProps = {
  assistantAvatar?: null | string;
  assistantAvatarUri?: null | string;
  assistantEmoji?: string;
  assistantName?: string;
  contentBottomInset: number;
};

/** Agent greeting shown before the first message is sent. */
export function ChatDraftState({
  assistantAvatar,
  assistantAvatarUri,
  assistantEmoji,
  assistantName,
  contentBottomInset,
}: ChatDraftStateProps) {
  const { t } = useTranslation();
  const composerInset = useComposerExpansion()?.meta.contentInset;
  const style = useAnimatedStyle(() => ({
    paddingBottom: contentBottomInset + (composerInset?.get() ?? 0),
  }));

  return (
    <Animated.View className="flex-1 items-center justify-center px-8" style={style}>
      <View className="items-center gap-6">
        {assistantName ? (
          <AgentAvatar
            avatar={assistantAvatar}
            emoji={assistantEmoji}
            name={assistantName}
            size={48}
            uri={assistantAvatarUri}
          />
        ) : null}
        <Text className="text-center font-medium text-foreground text-xl" numberOfLines={2}>
          {t('chat.draft.greeting')}
        </Text>
      </View>
    </Animated.View>
  );
}
