import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View } from 'react-native';

import type { SurfaceProps } from './surface.types';

// Real Liquid Glass on iOS 26+; older iOS falls back to the plain surface.
const supportsGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function Surface({
  children,
  className,
  cornerRadius,
  interactive,
  style,
  testID,
  tintColor,
}: SurfaceProps) {
  // Alignment is deliberately not set here — callers own it via `style`, so the
  // glass and fallback branches can't drift apart on it.
  const shape = { borderRadius: cornerRadius, overflow: 'hidden' } as const;

  if (supportsGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={[shape, style]}
        testID={testID}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View className={className} style={[shape, style]} testID={testID}>
      {children}
    </View>
  );
}
