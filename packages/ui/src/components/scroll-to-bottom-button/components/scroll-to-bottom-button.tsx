import ArrowDownIcon from '@cherrystudio/app-icons/icons/arrow-down';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { duration, easing } from '../../../motion';
import { Surface } from '../../surface';

const BUTTON_SIZE = 40;
const SURFACE_CLASS_NAME = 'border border-border bg-secondary';
const visibilityMotion = { duration: duration.fast, easing: easing.settle } as const;

export type ScrollToBottomButtonProps = {
  accessibilityLabel: string;
  bottomAccessoryHeight?: SharedValue<number>;
  gap: number;
  isAtBottom: boolean;
  onPress: () => void;
};

export function ScrollToBottomButton({
  accessibilityLabel,
  bottomAccessoryHeight,
  gap,
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

  const wrapStyle = useAnimatedStyle(
    () => ({ bottom: (bottomAccessoryHeight?.get() ?? 0) + gap }),
    [bottomAccessoryHeight, gap],
  );
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
          accessibilityLabel={accessibilityLabel}
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
