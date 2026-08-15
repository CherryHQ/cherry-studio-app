import type { BlurTint } from 'expo-blur';
import type { SharedValue } from 'react-native-reanimated';

export type ChatInputEffortBackdropProps = {
  progress: SharedValue<number>;
  scrimColor: string;
  tint?: BlurTint;
  variant: 'app' | 'keyboard';
};
