import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { PlatformColor, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { duration, easing } from '../../motion';
import { TabsContent } from './tabs-content';
import type { TabsProps } from './tabs.types';

const indicatorInset = 3;
const supportsGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

type Segment = { width: number; x: number };

export function Tabs<TValue extends string>(props: TabsProps<TValue>) {
  return props.variant && props.variant !== 'floating' ? (
    <TabsContent {...props} />
  ) : (
    <PlatformTabs {...props} />
  );
}

function PlatformTabs<TValue extends string>({
  accessibilityLabel,
  items,
  layout = 'fill',
  onValueChange,
  style,
  testID,
  value,
  variant,
}: TabsProps<TValue>) {
  const { fontScale } = useWindowDimensions();
  const tabHeight = variant === 'floating' ? Math.max(42, 20 * fontScale + 22) : 34;
  const roundStyle = useResolveClassNames('rounded-full');
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
  const frameStyle = {
    ...(variant === 'floating' ? roundStyle : { borderRadius: 17 }),
    height: tabHeight,
    overflow: 'hidden',
    ...(layout === 'hug' ? {} : { width: '100%' as const }),
  } as const;
  const handleLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    setMeasuredWidth(event.nativeEvent.layout.width);
  };
  const content = (
    <>
      {indicatorWidth > 0 ? (
        <Animated.View
          className={
            variant === 'floating'
              ? 'absolute left-0 rounded-full bg-card dark:bg-[var(--gray-500)]'
              : supportsGlass
                ? 'absolute left-0 rounded-full'
                : 'absolute left-0 rounded-full bg-background'
          }
          pointerEvents="none"
          style={[
            {
              ...(supportsGlass && variant !== 'floating'
                ? { backgroundColor: PlatformColor('tertiarySystemFill') }
                : undefined),
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
                  ? variant === 'floating'
                    ? 'h-full items-center justify-center px-3.5 disabled:opacity-40'
                    : 'h-full items-center justify-center px-4 disabled:opacity-40'
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
    </>
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      className={layout === 'hug' ? 'self-start' : 'w-full'}
      collapsable={false}
      style={[{ height: tabHeight }, style]}
      testID={testID}
    >
      {supportsGlass ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          onLayout={handleLayout}
          style={frameStyle}
        >
          {content}
        </GlassView>
      ) : (
        <View
          className={
            variant === 'floating'
              ? 'overflow-hidden rounded-full bg-[var(--gray-200)]/82 dark:bg-[var(--gray-200)]/88'
              : 'overflow-hidden rounded-[17px] bg-secondary'
          }
          onLayout={handleLayout}
          style={frameStyle}
        >
          {content}
        </View>
      )}
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
