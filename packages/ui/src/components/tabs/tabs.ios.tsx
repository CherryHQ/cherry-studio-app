import { GlassView } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { PlatformColor, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, easing } from '../../motion';
import type { TabsProps } from './tabs.types';

const tabHeight = 34;
const indicatorInset = 3;

type Segment = { width: number; x: number };

export function Tabs<TValue extends string>({
  accessibilityLabel,
  items,
  layout = 'fill',
  onValueChange,
  style,
  testID,
  value,
}: TabsProps<TValue>) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  // Only `hug` needs per-tab geometry: `fill` segments are the container split
  // evenly, which one measurement already gives.
  const [hugSegments, setHugSegments] = useState<Record<string, Segment>>({});
  const translateX = useSharedValue(0);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );
  const segment =
    layout === 'hug' ? hugSegments[value] : evenSegment(measuredWidth, items.length, selectedIndex);
  const indicatorWidth = segment ? Math.max(0, segment.width - indicatorInset * 2) : 0;
  const indicatorX = segment ? segment.x + indicatorInset : 0;

  useEffect(() => {
    translateX.value = withTiming(indicatorX, {
      duration: duration.base,
      easing: easing.settle,
    });
  }, [indicatorX, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      className={layout === 'hug' ? 'h-[34px] self-start' : 'h-[34px] w-full'}
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
          // `hug` leaves the width to the row of tabs inside.
          ...(layout === 'hug' ? {} : { width: '100%' as const }),
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
            const customContent =
              typeof item.children === 'function'
                ? item.children({ isDisabled: Boolean(item.disabled), isSelected })
                : item.children;

            return (
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="tab"
                accessibilityState={{ disabled: item.disabled, selected: isSelected }}
                className={
                  layout === 'hug'
                    ? 'h-full items-center justify-center px-4 disabled:opacity-40'
                    : 'h-full flex-1 items-center justify-center disabled:opacity-40'
                }
                disabled={item.disabled}
                hitSlop={{ bottom: 5, top: 5 }}
                key={item.value}
                onLayout={
                  layout === 'hug'
                    ? (event) => {
                        const { width, x } = event.nativeEvent.layout;
                        setHugSegments((current) =>
                          current[item.value]?.width === width && current[item.value]?.x === x
                            ? current
                            : { ...current, [item.value]: { width, x } },
                        );
                      }
                    : undefined
                }
                onPress={() => onValueChange(item.value)}
                testID={item.testID}
              >
                {item.children !== undefined ? (
                  customContent
                ) : (
                  <Text
                    adjustsFontSizeToFit
                    className="font-medium text-xs"
                    maxFontSizeMultiplier={1.2}
                    minimumFontScale={0.9}
                    numberOfLines={1}
                    style={{ color: PlatformColor(isSelected ? 'label' : 'secondaryLabel') }}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </GlassView>
    </View>
  );
}

function evenSegment(width: number, count: number, index: number): Segment | undefined {
  if (width <= 0 || count <= 0) {
    return undefined;
  }
  const segmentWidth = width / count;
  return { width: segmentWidth, x: segmentWidth * index };
}
