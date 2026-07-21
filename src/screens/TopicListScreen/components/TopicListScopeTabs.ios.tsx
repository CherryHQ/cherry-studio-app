import { GlassView } from 'expo-glass-effect';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlatformColor, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { getTopicListScopeIndex, topicListScopes } from '../utils/topicListScope';
import type { TopicListScopeTabsProps } from './TopicListScopeTabs.types';

const labelKeys = {
  conversations: 'topic.tabs.chat',
  drawings: 'topic.tabs.paint',
} as const;

const segmentCount = topicListScopes.length;
const indicatorInset = 3;
const tabHeight = 34;
const tabWidth = 144;
const segmentWidth = tabWidth / segmentCount;
const indicatorWidth = segmentWidth - indicatorInset * 2;

export function TopicListScopeTabs({ onScopeChange, scope }: TopicListScopeTabsProps) {
  const { i18n, t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const titleRef = useRef<View>(null);
  const [centerOffsetX, setCenterOffsetX] = useState(0);
  const translateX = useSharedValue(0);
  const nativeHeaderLayoutKey = `${i18n.resolvedLanguage ?? ''}:${scope}`;

  useEffect(() => {
    if (!nativeHeaderLayoutKey) {
      return;
    }

    setCenterOffsetX(0);
    let measurementFrame: number | undefined;
    const layoutFrame = requestAnimationFrame(() => {
      measurementFrame = requestAnimationFrame(() => {
        titleRef.current?.measureInWindow((x, _y, measuredWidth) => {
          const nextOffset = windowWidth / 2 - (x + measuredWidth / 2);
          setCenterOffsetX(nextOffset);
        });
      });
    });

    return () => {
      cancelAnimationFrame(layoutFrame);
      if (measurementFrame !== undefined) {
        cancelAnimationFrame(measurementFrame);
      }
    };
  }, [nativeHeaderLayoutKey, windowWidth]);

  useEffect(() => {
    translateX.value = withTiming(getTopicListScopeIndex(scope) * segmentWidth + indicatorInset, {
      duration: 220,
    });
  }, [scope, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));

  return (
    <View
      ref={titleRef}
      collapsable={false}
      style={{
        height: tabHeight,
        transform: [{ translateX: centerOffsetX }],
        width: tabWidth,
      }}
    >
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
          {topicListScopes.map((item) => {
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
