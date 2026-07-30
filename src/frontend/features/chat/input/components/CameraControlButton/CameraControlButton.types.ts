import type { PngIconProps } from 'lucide-uniwind/png';
import type { ComponentType } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * A round camera control (back / flip). Rendered as an iOS 26 liquid-glass
 * `@expo/ui` button on iOS (`.ios.tsx`) and a plain `Pressable` elsewhere
 * (`.android.tsx`). Callers pass both an `sfSymbol` (used on iOS) and a lucide
 * `icon` (used on Android) so each platform draws its native glyph.
 */
export type CameraControlButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: ComponentType<PngIconProps>;
  onPress: () => void;
  sfSymbol: SFSymbol;
};
