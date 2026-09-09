import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import Animated, {
  createAnimatedComponent,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import type { ChatInputEffortBackdropProps } from './ChatInputEffortBackdrop.types';
import { ChatInputEffortBackdropFocus } from './ChatInputEffortBackdropFocus';

const AnimatedBlurView = createAnimatedComponent(BlurView);
const blurIntensity = 30;
const scrimOpacity = { app: 0.07, keyboard: 0.08 } as const;
const FOCUS_BLUR_INSETS = [0, 0.07, 0.14, 0.21] as const;
const FOCUS_BLUR_INTENSITY = 9;

export function ChatInputEffortBackdrop({
  focusFrame,
  progress,
  scrimColor,
  tint,
  variant,
}: ChatInputEffortBackdropProps) {
  const { theme } = useUniwind();
  const blurProps = useAnimatedProps(() => ({
    intensity: blurIntensity * progress.value,
  }));
  const focusBlurProps = useAnimatedProps(() => ({
    intensity: FOCUS_BLUR_INTENSITY * progress.value,
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
      <ChatInputEffortBackdropFocus focusFrame={focusFrame} progress={progress}>
        {/* Unmasked, nested bands follow SidebarFade's native backdrop path. */}
        {focusFrame
          ? FOCUS_BLUR_INSETS.map((inset) => (
              <AnimatedBlurView
                key={inset}
                animatedProps={focusBlurProps}
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  { bottom: focusFrame.height * inset, top: focusFrame.height * inset },
                ]}
                tint={tint ?? (theme === 'dark' ? 'dark' : 'light')}
              />
            ))
          : null}
      </ChatInputEffortBackdropFocus>
    </>
  );
}
