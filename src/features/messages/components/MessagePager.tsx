import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { getMessageScopeIndex, useMessageScope } from '@/components/messageTabs';
import { DrawingList } from '@/features/paintings';
import { TopicList } from '@/features/topics';

type MessagePagerProps = {
  showRecentsHeading?: boolean;
};

// Hand-rolled two-page slider instead of @expo/ui's PagerView: the SwiftUI
// pager silently snaps back to page 0 when the native chrome around it
// changes (edit mode swaps the header title and mounts the bottom toolbar)
// while its scrollPosition state still holds the old id, so no setPage call
// can recover it. Swiping between pages was already disabled (it collides
// with the topic rows' own swipe actions), so scope-driven translation is
// all the paging this screen needs.
export function MessagePager({ showRecentsHeading = false }: MessagePagerProps) {
  const { t } = useTranslation();
  const { scope } = useMessageScope();
  const { width: windowWidth } = useWindowDimensions();
  const page = useSharedValue(getMessageScopeIndex(scope));

  useEffect(() => {
    page.value = withTiming(getMessageScopeIndex(scope), {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [page, scope]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -page.value * windowWidth }],
  }));

  return (
    <View className="flex-1 overflow-hidden" testID="topic-list-pager">
      <Animated.View className="flex-1 flex-row" style={[{ width: windowWidth * 2 }, trackStyle]}>
        <View collapsable={false} style={{ width: windowWidth }}>
          {showRecentsHeading ? (
            <Text className="px-5 pb-1 pt-1 font-medium text-foreground-secondary text-sm">
              {t('navigation.recents')}
            </Text>
          ) : null}
          <TopicList />
        </View>
        <View collapsable={false} style={{ width: windowWidth }}>
          <DrawingList />
        </View>
      </Animated.View>
    </View>
  );
}
