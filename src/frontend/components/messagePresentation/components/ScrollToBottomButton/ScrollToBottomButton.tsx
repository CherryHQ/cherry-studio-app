import { Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { ArrowDownIcon } from 'lucide-uniwind/png';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import type { ScrollToBottomButtonProps } from './types';

const BUTTON_SIZE = 40;
const visibilityMotion = { duration: duration.fast, easing: easing.settle } as const;

export function ScrollToBottomButton({
  gap,
  inputHeight,
  isAtBottom,
  onPress,
}: ScrollToBottomButtonProps) {
  const wrapStyle = useAnimatedStyle(() => ({ bottom: inputHeight.get() + gap }));
  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isAtBottom.get() ? 0 : 1, visibilityMotion),
    transform: [{ scale: withTiming(isAtBottom.get() ? 0.8 : 1, visibilityMotion) }],
  }));
  const containerProps = useAnimatedProps(() => ({
    pointerEvents: (isAtBottom.get() ? 'none' : 'auto') as 'auto' | 'none',
  }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, wrapStyle]}>
      <Animated.View animatedProps={containerProps} style={containerStyle}>
        <Pressable
          accessibilityLabel="滚动到底部"
          accessibilityRole="button"
          className="rounded-full shadow-sm active:opacity-60"
          hitSlop={8}
          onPress={onPress}
        >
          <Surface
            className="border border-border bg-secondary"
            cornerRadius={BUTTON_SIZE / 2}
            interactive
            style={styles.surface}
          >
            <ArrowDownIcon className="size-5 text-foreground" strokeWidth={2} />
          </Surface>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center',
    height: BUTTON_SIZE,
    justifyContent: 'center',
    width: BUTTON_SIZE,
  },
  wrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
