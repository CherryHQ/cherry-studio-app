import { Pressable, StyleSheet, View } from 'react-native';

import type { CameraShutterButtonProps } from './CameraShutterButton.types';

// Default (Android) shutter: classic white ring around a white disc. The iOS
// liquid-glass variant lives in CameraShutterButton.ios.tsx.
export function CameraShutterButton({
  accessibilityLabel,
  disabled = false,
  onPress,
}: CameraShutterButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-[72px] items-center justify-center rounded-full border-[3px] border-constant-white p-1.5 active:opacity-70"
      disabled={disabled}
      onPress={onPress}
      style={disabled ? styles.disabled : undefined}
    >
      <View className="flex-1 self-stretch rounded-full bg-constant-white" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4,
  },
});
