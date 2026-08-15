import type { StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

export type IconGlyphProps = {
  color?: string;
  config: { glyph: string; sf: SFSymbol };
  height: number;
  style?: StyleProp<ViewStyle>;
  width: number;
};
