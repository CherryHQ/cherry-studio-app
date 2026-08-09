import { duration, easing } from '@cherrystudio/ui/motion';
import { Button, Host, Image } from '@expo/ui/swift-ui';
import { frame, glassEffect } from '@expo/ui/swift-ui/modifiers';
import { PlatformColor, StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import type { ScrollToBottomButtonProps } from './types';

const BUTTON_SIZE = 40;
const visibilityMotion = { duration: duration.fast, easing: easing.settle } as const;

// iOS：@expo/ui(SwiftUI)Button + 液态玻璃(glassEffect circle)做圆形「滚动到底部」按钮。
// 显隐/定位均由 reanimated 共享值驱动，与 Android 实现保持一致的行为。
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
        <Host style={styles.host}>
          <Button
            onPress={onPress}
            modifiers={[
              frame({ height: BUTTON_SIZE, width: BUTTON_SIZE }),
              glassEffect({ glass: { interactive: true, variant: 'regular' }, shape: 'circle' }),
            ]}
          >
            {/* PlatformColor('label')=iOS 系统主前景色，深浅自适应、非蓝，等价 text-foreground */}
            <Image systemName="arrow.down" size={18} color={PlatformColor('label')} />
          </Button>
        </Host>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    height: BUTTON_SIZE,
    width: BUTTON_SIZE,
  },
  wrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
