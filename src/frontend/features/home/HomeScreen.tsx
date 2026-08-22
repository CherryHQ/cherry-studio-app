import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';

import { AiUsageSummaryCard } from './aiUsage';
import { HomeHeaderAvatarButton } from './components/HomeHeaderAvatarButton';

export default function HomeScreen() {
  const { t } = useTranslation();
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [{ element: <HomeHeaderAvatarButton />, key: 'home-profile-avatar', type: 'custom' }],
    [],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('navigation.home')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3 px-2 pt-3">
          <AiUsageSummaryCard />
        </View>
      </ScrollView>
    </>
  );
}
