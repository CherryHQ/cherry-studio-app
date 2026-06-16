import { ArrowDownIcon } from 'lucide-uniwind/png';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { ScrollToBottomButtonProps } from './types';

// Android：Pressable + lucide 图标的圆形「滚动到底部」按钮，只要不在最底部就淡入。
export function ScrollToBottomButton({ bottomInset, isAtBottom, onPress }: ScrollToBottomButtonProps) {
  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isAtBottom.value ? 0 : 1, { duration: 160 }),
    transform: [{ scale: withTiming(isAtBottom.value ? 0.8 : 1, { duration: 160 }) }],
  }));
  // 在最底部时一并禁用点击，避免淡出后仍拦截触摸。
  const containerProps = useAnimatedProps(() => ({
    pointerEvents: (isAtBottom.value ? 'none' : 'auto') as 'auto' | 'none',
  }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomInset }]}>
      <Animated.View animatedProps={containerProps} style={containerStyle}>
        <Pressable
          accessibilityLabel="滚动到底部"
          accessibilityRole="button"
          className="size-10 items-center justify-center rounded-full border border-border bg-surface-secondary shadow-sm active:bg-surface-tertiary"
          hitSlop={8}
          onPress={onPress}
        >
          <ArrowDownIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
