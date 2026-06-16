/**
 * The camera shutter (capture) control. Rendered as an iOS 26 liquid-glass ring
 * around a solid white disc on iOS (`.ios.tsx`), and a classic white ring + disc
 * `Pressable` elsewhere (`.android.tsx`).
 */
export type CameraShutterButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
};
