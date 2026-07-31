import { Pressable } from 'react-native';

import type { CameraControlButtonProps } from './CameraControlButton.types';

// Default (Android) implementation: a plain Pressable with a translucent dark
// backing. The iOS liquid-glass variant lives in CameraControlButton.ios.tsx.
export function CameraControlButton({
  accessibilityLabel,
  disabled = false,
  icon: Icon,
  onPress,
}: CameraControlButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-12 items-center justify-center rounded-full bg-black/40 active:opacity-70"
      disabled={disabled}
      onPress={onPress}
    >
      <Icon className="size-6 text-white" strokeWidth={2} />
    </Pressable>
  );
}
