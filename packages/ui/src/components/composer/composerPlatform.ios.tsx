import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View } from 'react-native';

import type { ComposerSurfaceProps, ComposerTextInsets } from './composerPlatform.types';

// Real Liquid Glass on iOS 26+; older iOS falls back to the plain surface.
const supportsGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

// UITextView draws its text ~2.5px lower than the box it reports to layout, so a
// multiline TextInput sits visibly low inside a centered pill. The box itself is
// centered correctly — measured on an iPhone 17 simulator, 5px of slack above and
// below inside a 44px pill — so the correction belongs in the text's own padding.
// `textAlignVertical` is NOT the fix: it is Android-only and moves nothing here
// (verified by measurement, not by reading the docs).
//
// To re-measure: tint the TextInput's background, screenshot, and compare the
// midpoint of the glyph band against the midpoint of the pill.
const textBaselineNudge = 2.5;
const textPaddingVertical = 4;

export const composerTextInsets: ComposerTextInsets = {
  paddingBottom: textPaddingVertical + textBaselineNudge,
  paddingTop: textPaddingVertical - textBaselineNudge,
};

export function ComposerSurface({
  children,
  className,
  cornerRadius,
  interactive,
  style,
  tintColor,
}: ComposerSurfaceProps) {
  // Alignment is deliberately not set here — callers own it via `style`, so the
  // glass and fallback branches can't drift apart on it.
  const shape = { borderRadius: cornerRadius, overflow: 'hidden' } as const;

  if (supportsGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={[shape, style]}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View className={className} style={[shape, style]}>
      {children}
    </View>
  );
}
