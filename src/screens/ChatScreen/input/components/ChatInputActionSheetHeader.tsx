import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export function ChatInputActionSheetHeader() {
  const { t } = useTranslation();

  return (
    <View className="min-h-8 flex-row items-center justify-between gap-3">
      <Text className="font-semibold text-base text-foreground">{t('common.cherryStudio')}</Text>
    </View>
  );
}
