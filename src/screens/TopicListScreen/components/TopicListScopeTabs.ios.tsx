import { GlassView } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlatformColor, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTopicListScope } from '../context/TopicListScopeProvider';
import { getTopicListScopeIndex, topicListScopes } from '../utils/topicListScope';
import type { TopicListScopeTabsProps } from './TopicListScopeTabs.types';

const labelKeys = {
  conversations: 'topic.tabs.conversations',
  drawings: 'topic.tabs.drawings',
} as const;

const segmentCount = topicListScopes.length;
const indicatorInset = 3;
const tabBarHeight = 56;
const visibilityTransitionDuration = 220;

export function TopicListScopeTabs({ isVisible }: TopicListScopeTabsProps) {
  const { t } = useTranslation();
  const { scope, setScope } = useTopicListScope();
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const segmentWidth = width / segmentCount;
  const indicatorWidth = Math.max(0, segmentWidth - indicatorInset * 2);

  useEffect(() => {
    translateX.value = withTiming(getTopicListScopeIndex(scope) * segmentWidth + indicatorInset, {
      duration: 220,
    });
  }, [scope, segmentWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));
  const visibilityStyle = useAnimatedStyle(() => ({
    height: withTiming(isVisible ? tabBarHeight : 0, {
      duration: visibilityTransitionDuration,
      easing: Easing.inOut(Easing.ease),
    }),
    opacity: withTiming(isVisible ? 1 : 0, {
      duration: visibilityTransitionDuration,
      easing: Easing.inOut(Easing.ease),
    }),
  }));

  return (
    <Animated.View
      accessibilityElementsHidden={!isVisible}
      className="w-full items-center justify-center overflow-hidden px-4"
      importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={visibilityStyle}
    >
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        style={{
          borderRadius: 20,
          height: 40,
          overflow: 'hidden',
          width: '100%',
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Animated.View
            className="absolute left-0 rounded-full"
            pointerEvents="none"
            style={[
              {
                backgroundColor: PlatformColor('tertiarySystemFill'),
                bottom: indicatorInset,
                top: indicatorInset,
              },
              indicatorStyle,
            ]}
          />
        ) : null}
        <View className="h-full flex-row">
          {topicListScopes.map((item) => {
            const isSelected = item === scope;

            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                className="h-10 flex-1 items-center justify-center"
                testID={`topic-list-tab-${item}`}
                onPress={() => setScope(item)}
              >
                <Text
                  className="font-medium text-sm"
                  style={{
                    color: PlatformColor(isSelected ? 'label' : 'secondaryLabel'),
                  }}
                >
                  {t(labelKeys[item])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassView>
    </Animated.View>
  );
}
