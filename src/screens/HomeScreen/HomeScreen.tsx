import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { TabRootHeader } from '@/components/headers';
import type { HeaderToolbarAction } from '@/components/headers/BackHeader/BackHeader.types';

import {
  createPreviewActivityData,
  getPreviewActivityDayCount,
  HomeActivityCard,
} from './activity';
import { HomeHeaderAvatarButton } from './components/HomeHeaderAvatarButton';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [activityEndDate] = useState(() => new Date());
  const activityData = useMemo(
    () => createPreviewActivityData(activityEndDate, getPreviewActivityDayCount(windowWidth)),
    [activityEndDate, windowWidth],
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
          <HomeActivityCard data={activityData} />
        </View>
      </ScrollView>
    </>
  );
}
