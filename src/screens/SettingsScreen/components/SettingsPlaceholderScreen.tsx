import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/components/headers';

type SettingsPlaceholderScreenProps = {
  placeholderKey: string;
  titleKey: string;
};

export function SettingsPlaceholderScreen({
  placeholderKey,
  titleKey,
}: SettingsPlaceholderScreenProps) {
  const { t } = useTranslation();

  return (
    <>
      <BackHeader title={t(titleKey)} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          <View className="rounded-2xl bg-surface-secondary px-4 py-5">
            <Text className="text-base text-default-foreground">{t(placeholderKey)}</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
