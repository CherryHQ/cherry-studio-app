import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

export type ComposerSurfaceProps = {
  children: ReactNode;
  /** Non-glass styling only. `GlassView` ignores className, so keep geometry in `style`. */
  className: string;
  cornerRadius: number;
  /** iOS 26+ only: the glass swells and shimmers under touch. Ignored elsewhere. */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
};

/**
 * Vertical padding of the text field. iOS needs it asymmetric to cancel out
 * UITextView's baseline offset; every other platform is symmetric.
 */
export type ComposerTextInsets = Pick<TextStyle, 'paddingBottom' | 'paddingTop'>;
