import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '../../../motion';

const disclosureMotion = {
  duration: duration.base,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

type MessagePartCollapsibleProps = {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  testID?: string;
};

/**
 * Reflows the message around inline detail while it opens or closes. Once open,
 * later measurements update the height directly so streamed reasoning can grow
 * without restarting an animation for every text update.
 */
export function MessagePartCollapsible({
  children,
  className,
  isOpen,
  testID,
}: MessagePartCollapsibleProps) {
  const [contentHeight, setContentHeight] = useState(0);
  const [isContentMounted, setIsContentMounted] = useState(isOpen);
  const isSettledOpen = useRef(isOpen);
  const height = useSharedValue(0);
  const opacity = useSharedValue(isOpen ? 1 : 0);
  const isReducedMotion = useReducedMotion();

  const completeOpening = useCallback(() => {
    isSettledOpen.current = true;
  }, []);
  const completeClosing = useCallback(() => {
    isSettledOpen.current = false;
    setContentHeight(0);
    setIsContentMounted(false);
  }, []);

  useEffect(() => {
    if (isReducedMotion) {
      cancelAnimation(height);
      cancelAnimation(opacity);
      isSettledOpen.current = isOpen;
      height.set(isOpen ? contentHeight : 0);
      opacity.set(isOpen ? 1 : 0);
      return;
    }

    if (isOpen) {
      if (contentHeight === 0) return;

      if (isSettledOpen.current) {
        height.set(contentHeight);
        opacity.set(1);
        return;
      }

      height.set(
        withTiming(contentHeight, disclosureMotion, (finished) => {
          if (finished) scheduleOnRN(completeOpening);
        }),
      );
      opacity.set(withTiming(1, disclosureMotion));
      return;
    }

    isSettledOpen.current = false;
    if (!isContentMounted) return;

    height.set(
      withTiming(0, disclosureMotion, (finished) => {
        if (finished) scheduleOnRN(completeClosing);
      }),
    );
    opacity.set(withTiming(0, disclosureMotion));
  }, [
    completeClosing,
    completeOpening,
    contentHeight,
    height,
    isOpen,
    isContentMounted,
    isReducedMotion,
    opacity,
  ]);

  useEffect(
    () => () => {
      cancelAnimation(height);
      cancelAnimation(opacity);
    },
    [height, opacity],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.get(),
    opacity: opacity.get(),
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setIsContentMounted(true);
    setContentHeight((current) => (Math.abs(current - nextHeight) <= 1 ? current : nextHeight));

    if (isOpen && isSettledOpen.current) height.set(nextHeight);
  };

  if (isReducedMotion) {
    return isOpen ? (
      <View className={className} onLayout={handleLayout} testID={testID}>
        {children}
      </View>
    ) : null;
  }

  if (!isOpen && !isContentMounted) return null;

  return (
    <Animated.View
      accessibilityElementsHidden={!isOpen}
      className="overflow-hidden"
      importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isOpen ? 'auto' : 'none'}
      style={animatedStyle}
      testID={isOpen ? testID : undefined}
    >
      <View className={className} onLayout={handleLayout} style={styles.measuredContent}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  measuredContent: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
