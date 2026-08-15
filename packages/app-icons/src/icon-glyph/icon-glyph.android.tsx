import { Text, type StyleProp, type TextStyle } from 'react-native';

import type { IconGlyphProps } from './icon-glyph.types';

/** The bundled font file's base name, which Android uses as its family name. */
const materialFontFamily = 'MaterialSymbols';

export function IconGlyph({ color, config, height, style, width }: IconGlyphProps) {
  return (
    <Text
      accessible={false}
      allowFontScaling={false}
      importantForAccessibility="no"
      style={[
        {
          color,
          fontFamily: materialFontFamily,
          fontSize: Math.min(width, height),
          height,
          includeFontPadding: false,
          lineHeight: height,
          textAlign: 'center',
          width,
        },
        style as StyleProp<TextStyle>,
      ]}
    >
      {config.glyph}
    </Text>
  );
}
