import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View } from 'react-native';

import type { SurfaceFrameProps } from './surface-frame.types';

const supportsGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

export function SurfaceFrame({
  children,
  className,
  cornerRadius,
  interactive,
  style,
  testID,
  tintColor,
}: SurfaceFrameProps) {
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
