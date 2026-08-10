import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type SurfaceProps = {
  children?: ReactNode;
  /**
   * Styling for the non-glass fallback only. `GlassView` ignores className, so
   * anything that must hold on both branches (size, padding, alignment) belongs
   * in `style`.
   */
  className: string;
  /** Corner radius in px — `GlassView` can't read it from className. */
  cornerRadius: number;
  /** iOS 26+ only: the glass swells and shimmers under touch. Ignored elsewhere. */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Tints the glass; on the fallback branch use a background color in `className`. */
  tintColor?: string;
};
