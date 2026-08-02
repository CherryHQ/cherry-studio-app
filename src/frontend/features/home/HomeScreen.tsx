import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { TabRootHeader } from '@/frontend/components/headers';
import type { HeaderToolbarAction } from '@/frontend/components/headers/BackHeader/BackHeader.types';

import { AiUsageCard, createPreviewAiUsageData, getPreviewAiUsageDayCount } from './aiUsage';
import { HomeHeaderAvatarButton } from './components/HomeHeaderAvatarButton';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [aiUsageEndDate] = useState(() => new Date());
  const aiUsageData = useMemo(
    () => createPreviewAiUsageData(aiUsageEndDate, getPreviewAiUsageDayCount(windowWidth)),
    [aiUsageEndDate, windowWidth],
  );

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [{ element: <HomeHeaderAvatarButton />, key: 'home-profile-avatar' }],
    [],
  );

  return (
    <>
      <TabRootHeader rightActions={rightActions} title={t('navigation.home')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3 px-2 pt-3">
          <AiUsageCard data={aiUsageData} />
        </View>
      </ScrollView>
    </>
  );
}
