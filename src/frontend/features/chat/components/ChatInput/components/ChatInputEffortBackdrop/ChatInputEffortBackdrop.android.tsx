import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { ChatInputEffortBackdropProps } from './ChatInputEffortBackdrop.types';
import { ChatInputEffortBackdropFocus } from './ChatInputEffortBackdropFocus';

const scrimOpacity = { app: 0.2, keyboard: 0.24 } as const;

export function ChatInputEffortBackdrop({
  focusFrame,
  progress,
  scrimColor,
  variant,
}: ChatInputEffortBackdropProps) {
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * scrimOpacity[variant],
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor }, scrimStyle]}
      />
      <ChatInputEffortBackdropFocus focusFrame={focusFrame} progress={progress} />
    </>
  );
}
