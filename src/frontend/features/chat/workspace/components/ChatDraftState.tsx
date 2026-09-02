import { Image } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

const CHERRY_STUDIO_LOGO = require('@/assets/cherry-studio-splash-logo.png');

type ChatDraftStateProps = {
  contentBottomInset: number;
};

/** Quiet brand surface shown before the first message is sent. */
export function ChatDraftState({ contentBottomInset }: ChatDraftStateProps) {
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: contentBottomInset }}
    >
      <View className="items-center gap-6">
        <View className="size-16 items-center justify-center rounded-full bg-primary/10">
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            className="size-16"
            contentFit="contain"
            source={CHERRY_STUDIO_LOGO}
          />
        </View>
        <Text className="text-center font-medium text-foreground text-xl" numberOfLines={2}>
          {t('chat.draft.greeting')}
        </Text>
      </View>
    </View>
  );
}
