import { Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

type ChatOlderMessagesIndicatorProps = {
  isLoading: boolean;
};

export function ChatOlderMessagesIndicator({ isLoading }: ChatOlderMessagesIndicatorProps) {
  const { t } = useTranslation();

  if (!isLoading) {
    return null;
  }

  return (
    <View className="flex-row items-center justify-center gap-2 border-b border-border bg-secondary px-3 py-1.5">
      <Spinner
        accessibilityLabel={t('chat.history.loading')}
        accessibilityRole="progressbar"
        size="sm"
      />
    </View>
  );
}
