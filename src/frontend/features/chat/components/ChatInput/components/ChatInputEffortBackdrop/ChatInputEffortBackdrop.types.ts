import type { BlurTint } from 'expo-blur';
import type { SharedValue } from 'react-native-reanimated';

export type ChatInputEffortBackdropProps = {
  /** Focus bounds in this backdrop window's coordinates, including the fade edges. */
  focusFrame: { height: number; top: number } | null;
  progress: SharedValue<number>;
  scrimColor: string;
  tint?: BlurTint;
  variant: 'app' | 'keyboard';
};
