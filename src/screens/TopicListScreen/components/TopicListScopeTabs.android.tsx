import { Tabs } from 'heroui-native';
import { useTranslation } from 'react-i18next';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTopicListScope } from '../context/TopicListScopeProvider';
import { type TopicListScope, topicListScopes } from '../utils/topicListScope';
import type { TopicListScopeTabsProps } from './TopicListScopeTabs.types';

const labelKeys = {
  conversations: 'topic.tabs.conversations',
  drawings: 'topic.tabs.drawings',
} as const;

const tabBarHeight = 56;
const visibilityTransitionDuration = 220;

export function TopicListScopeTabs({ isVisible }: TopicListScopeTabsProps) {
  const { t } = useTranslation();
  const { scope, setScope } = useTopicListScope();
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
      className="w-full overflow-hidden"
      importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={visibilityStyle}
    >
      <Tabs
        className="w-full px-4 py-2"
        value={scope}
        onValueChange={(value) => {
          setScope(value as TopicListScope);
        }}
      >
        <Tabs.List className="w-full self-stretch">
          <Tabs.Indicator />
          {topicListScopes.map((item) => (
            <Tabs.Trigger
              key={item}
              className="flex-1"
              testID={`topic-list-tab-${item}`}
              value={item}
            >
              <Tabs.Label>{t(labelKeys[item])}</Tabs.Label>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>
    </Animated.View>
  );
}
