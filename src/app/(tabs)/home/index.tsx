import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { TabRootHeader } from '@/components/headers';

export default function HomeRoute() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-background">
      <TabRootHeader title={t('navigation.home')} />
    </View>
  );
}
