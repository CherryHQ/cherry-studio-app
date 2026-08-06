import { GlassView } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { PlatformColor, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { TabsProps } from './tabs.types';

const tabHeight = 34;
const indicatorInset = 3;

export function Tabs<TValue extends string>({
  accessibilityLabel,
  items,
  onValueChange,
  style,
  testID,
  value,
}: TabsProps<TValue>) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const translateX = useSharedValue(0);
  const segmentWidth = items.length > 0 ? measuredWidth / items.length : 0;
  const indicatorWidth = Math.max(0, segmentWidth - indicatorInset * 2);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  useEffect(() => {
    translateX.value = withTiming(selectedIndex * segmentWidth + indicatorInset, {
      duration: 220,
    });
  }, [segmentWidth, selectedIndex, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      className="h-[34px] w-full"
      collapsable={false}
      style={style}
      testID={testID}
    >
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
        style={{
          borderRadius: tabHeight / 2,
          height: tabHeight,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {indicatorWidth > 0 ? (
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
            testID={testID ? `${testID}-indicator` : undefined}
          />
        ) : null}
        <View className="h-full flex-row">
          {items.map((item) => {
            const isSelected = item.value === value;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ disabled: item.disabled, selected: isSelected }}
                className="h-full flex-1 items-center justify-center disabled:opacity-40"
                disabled={item.disabled}
                hitSlop={{ bottom: 5, top: 5 }}
                key={item.value}
                onPress={() => onValueChange(item.value)}
                testID={item.testID}
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
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassView>
    </View>
  );
}
