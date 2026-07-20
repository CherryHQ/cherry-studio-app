import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

export type SlotTextProps = {
  accessibilityLabel?: string;
  allowFontScaling?: boolean;
  /** Strength of deterministic per-grapheme timing variation and tilt. */
  bounce?: number;
  colorFadeDurationMs?: number;
  containerStyle?: StyleProp<ViewStyle>;
  durationMs?: number;
  exitOffsetMs?: number;
  /** Longer values render as one static Text node instead of grapheme slots. */
  maxGraphemes?: number;
  maxFontSizeMultiplier?: number;
  /** Keep a grapheme static only when it is unchanged and its slot offset will not move. */
  skipUnchanged?: boolean;
  staggerMs?: number;
  testID?: string;
  text: string;
  textClassName?: string;
  textStyle?: StyleProp<TextStyle>;
};

export type ResolvedSlotTextOptions = {
  bounce: number;
  colorFadeDurationMs: number;
  durationMs: number;
  exitOffsetMs: number;
  maxGraphemes: number;
  skipUnchanged: boolean;
  staggerMs: number;
};
