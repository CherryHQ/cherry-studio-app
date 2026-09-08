import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

type ChatEmptyStateProps = {
  contentBottomInset: number;
};

/** Empty chat surface shown until the user selects an Agent or opens a Session. */
export function ChatEmptyState({ contentBottomInset }: ChatEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: contentBottomInset }}
    >
      <View className="items-center gap-2">
        <Text className="text-center font-semibold text-foreground text-lg">
          {t('chat.newSession.title')}
        </Text>
        <Text className="text-center text-foreground text-sm" numberOfLines={3}>
          {t('chat.newSession.description')}
        </Text>
      </View>
    </View>
  );
}
