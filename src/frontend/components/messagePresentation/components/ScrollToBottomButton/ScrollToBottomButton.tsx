import { ArrowDownIcon } from '@cherrystudio/app-icons';
import { Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import type { ScrollToBottomButtonProps } from './types';

const BUTTON_SIZE = 40;
const SURFACE_CLASS_NAME = 'border border-border bg-secondary';
const visibilityMotion = { duration: duration.fast, easing: easing.settle } as const;

export function ScrollToBottomButton({
  gap,
  inputHeight,
  isAtBottom,
  onPress,
}: ScrollToBottomButtonProps) {
  const surfaceTokens = useResolveClassNames(SURFACE_CLASS_NAME);
  const tintColor =
    typeof surfaceTokens.backgroundColor === 'string' ? surfaceTokens.backgroundColor : undefined;
  const surfaceStyle = [
    styles.surface,
    { borderColor: surfaceTokens.borderColor, borderWidth: surfaceTokens.borderWidth },
  ];

  const wrapStyle = useAnimatedStyle(() => ({ bottom: inputHeight.get() + gap }));
  const containerStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: withTiming(isAtBottom ? 0.8 : 1, visibilityMotion) }] }),
    [isAtBottom],
  );

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, wrapStyle]}>
      <Animated.View
        pointerEvents={isAtBottom ? 'none' : 'auto'}
        style={[containerStyle, { opacity: isAtBottom ? 0 : 1 }]}
      >
        <Pressable
          accessibilityLabel="滚动到底部"
          accessibilityRole="button"
          className="rounded-full shadow-sm active:opacity-60"
          hitSlop={8}
          onPress={onPress}
        >
          <Surface
            className={SURFACE_CLASS_NAME}
            cornerRadius={BUTTON_SIZE / 2}
            interactive
            style={surfaceStyle}
            tintColor={tintColor}
          >
            <ArrowDownIcon className="size-5 text-foreground" />
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
