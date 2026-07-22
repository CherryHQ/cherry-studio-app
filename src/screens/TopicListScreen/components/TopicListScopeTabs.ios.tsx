import { GlassView } from 'expo-glass-effect';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PlatformColor, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { getMessageScopeIndex, messageScopes } from '@/components/messageTabs';

import type { TopicListScopeTabsProps } from './TopicListScopeTabs.types';

const labelKeys = {
  conversations: 'topic.tabs.chat',
  drawings: 'topic.tabs.paint',
} as const;

const segmentCount = messageScopes.length;
const indicatorInset = 3;
const tabHeight = 34;
const tabWidth = 144;
const segmentWidth = tabWidth / segmentCount;
const indicatorWidth = segmentWidth - indicatorInset * 2;

// The pill sits in the native nav-bar title slot, which UIKit already centers
// within the current window — measured x=129 on a 402pt window in both scopes
// (screen-centered), and UIKit re-centers on window resize / iPad split view.
// So no JS measurement is needed: an earlier measureInWindow → translateX hack
// fed its own transform back into itself and shoved the pill to the screen edge.
export function TopicListScopeTabs({ onScopeChange, scope }: TopicListScopeTabsProps) {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(getMessageScopeIndex(scope) * segmentWidth + indicatorInset, {
      duration: 220,
    });
  }, [scope, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));

  return (
    <View collapsable={false} style={{ height: tabHeight, width: tabWidth }}>
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        style={{
          borderRadius: tabHeight / 2,
          height: tabHeight,
          overflow: 'hidden',
          width: tabWidth,
        }}
      >
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
        <View className="h-full flex-row">
          {messageScopes.map((item) => {
            const isSelected = item === scope;

            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                className="h-full flex-1 items-center justify-center"
                hitSlop={{ bottom: 5, top: 5 }}
                testID={`topic-list-tab-${item}`}
                onPress={() => onScopeChange(item)}
              >
                <Text
                  adjustsFontSizeToFit
                  className="font-medium"
                  maxFontSizeMultiplier={1.2}
                  minimumFontScale={0.9}
                  numberOfLines={1}
                  style={{
                    color: PlatformColor(isSelected ? 'label' : 'secondaryLabel'),
                    fontSize: 13,
                    lineHeight: 16,
                  }}
                >
                  {t(labelKeys[item])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassView>
    </View>
  );
}
