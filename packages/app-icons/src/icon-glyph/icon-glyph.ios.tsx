import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import type { IconGlyphProps } from './icon-glyph.types';

export function IconGlyph({ color, config, height, style, width }: IconGlyphProps) {
  return (
    // SymbolView is an ExpoView wrapping a UIImageView, and `UIImage(systemName:)` carries
    // UIKit's own accessibility description. Hide the decorative subtree so the enclosing
    // pressable remains the sole accessibility owner.
    <View accessibilityElementsHidden style={[{ height, width }, style]}>
      <SymbolView
        name={config.sf}
        resizeMode="scaleAspectFit"
        size={Math.min(width, height)}
        style={{ height, width }}
        tintColor={color}
      />
    </View>
  );
}
