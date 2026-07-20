import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePreference } from '@/data/hooks';

import {
  createPreviewActivityData,
  getPreviewActivityDayCount,
  HomeActivityCard,
} from './activity';
import { HomePlaceholderCards } from './components/HomePlaceholderCards';
import { HomeProfileHero } from './components/HomeProfileHero';
import { HomeStickyBar } from './components/HomeStickyBar';
import { useHomeHeaderAnimation } from './hooks/useHomeHeaderAnimation';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width: windowWidth } = useWindowDimensions();
  const [userName] = usePreference('app.user.name');
  const [activityEndDate] = useState(() => new Date());
  const activityData = useMemo(
    () => createPreviewActivityData(activityEndDate, getPreviewActivityDayCount(windowWidth)),
    [activityEndDate, windowWidth],
  );
  const { lockProgress, lockState, onScroll, scrollY } = useHomeHeaderAnimation();

  const openProfileSettings = useCallback(() => {
    router.push('/settings/profile');
  }, [router]);

  // Own the insets explicitly: `never` keeps the scroll-offset zero point stable
  // (so scrollY reads 0 at rest and negative on iOS overscroll), which the whole
  // animation depends on. No top padding: the hero box is pinned to content y=0
  // and draws under the status bar, exactly like the reference header.
  const contentContainerStyle = useMemo(() => ({ paddingBottom: tabBarHeight }), [tabBarHeight]);

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        alwaysBounceVertical
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="never"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <HomeProfileHero
          lockProgress={lockProgress}
          lockState={lockState}
          onPress={openProfileSettings}
          scrollY={scrollY}
          userName={userName}
        />
        <View className="gap-3 px-2 pt-6">
          <HomeActivityCard data={activityData} />
          <HomePlaceholderCards />
        </View>
      </Animated.ScrollView>
      <HomeStickyBar scrollY={scrollY} topInset={insets.top} userName={userName} />
    </View>
  );
}
