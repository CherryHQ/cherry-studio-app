import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import type { ChatInputEffortBackdropProps } from './ChatInputEffortBackdrop.types';
import { ChatInputEffortBackdropFocus } from './ChatInputEffortBackdropFocus';

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
  const blurTint = tint ?? (theme === 'dark' ? 'dark' : 'light');
  // Blurs keep a fixed intensity and fade as layers: expo-blur rebuilds its effect on every
  // intensity change, which dropped a frame per transition when intensity followed `progress`.
  const blurStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * scrimOpacity[variant],
  }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
        <BlurView intensity={blurIntensity} style={StyleSheet.absoluteFill} tint={blurTint} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor }, scrimStyle]}
      />
      <ChatInputEffortBackdropFocus focusFrame={focusFrame} progress={progress}>
        {/* Unmasked, nested bands follow SidebarFade's native backdrop path. */}
        {focusFrame ? (
          <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
            {FOCUS_BLUR_INSETS.map((inset) => (
              <BlurView
                key={inset}
                intensity={FOCUS_BLUR_INTENSITY}
                style={[
                  StyleSheet.absoluteFill,
                  { bottom: focusFrame.height * inset, top: focusFrame.height * inset },
                ]}
                tint={blurTint}
              />
            ))}
          </Animated.View>
        ) : null}
      </ChatInputEffortBackdropFocus>
    </>
  );
}
