import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { ChatInputEffortBackdropProps } from './ChatInputEffortBackdrop.types';

const FADE_LOCATIONS = [0, 0.32, 0.68, 1] as const;
const SURFACE_OPACITY = 0.72;

type ChatInputEffortBackdropFocusProps = Pick<
  ChatInputEffortBackdropProps,
  'focusFrame' | 'progress'
> & {
  children?: ReactNode;
};

/** A local focus field whose surface dissolves above and below the effort panel. */
export function ChatInputEffortBackdropFocus({
  children,
  focusFrame,
  progress,
}: ChatInputEffortBackdropFocusProps) {
  const surfaceColor = useThemeColor('popover');
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: SURFACE_OPACITY * progress.value,
  }));

  if (!focusFrame) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.container, focusFrame]}
      testID="chat-input-effort-focus-backdrop"
    >
      {children}
      <Animated.View style={[StyleSheet.absoluteFill, surfaceStyle]}>
        <LinearGradient
          colors={['transparent', surfaceColor, surfaceColor, 'transparent']}
          locations={FADE_LOCATIONS}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { left: 0, position: 'absolute', right: 0 },
});
