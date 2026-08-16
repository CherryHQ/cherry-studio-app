import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import Animated, {
  createAnimatedComponent,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import type { ChatInputEffortBackdropProps } from './ChatInputEffortBackdrop.types';

const AnimatedBlurView = createAnimatedComponent(BlurView);
const blurIntensity = 30;
const scrimOpacity = { app: 0.07, keyboard: 0.08 } as const;

export function ChatInputEffortBackdrop({
  progress,
  scrimColor,
  tint,
  variant,
}: ChatInputEffortBackdropProps) {
  const { theme } = useUniwind();
  const blurProps = useAnimatedProps(() => ({
    intensity: blurIntensity * progress.value,
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * scrimOpacity[variant],
  }));

  return (
    <>
      <AnimatedBlurView
        animatedProps={blurProps}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        tint={tint ?? (theme === 'dark' ? 'dark' : 'light')}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor }, scrimStyle]}
      />
    </>
  );
}
