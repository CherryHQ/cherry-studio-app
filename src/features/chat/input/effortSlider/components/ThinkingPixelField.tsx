import { Canvas, RoundedRect, Shader } from '@shopify/react-native-skia';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import { thinkingPixelFieldEffect } from '../shaders/thinkingPixelField';
import type { ThinkingPaletteUniforms } from '../utils/thinkingPalette';

type ThinkingPixelFieldProps = {
  /** Track size in dp; the canvas fills its parent absolutely. */
  width: number;
  height: number;
  /** Corner radius of the track the field is clipped to. */
  radius: number;
  palette: ThinkingPaletteUniforms;
  /** Wrapped shader clock from useShaderClock (seconds). */
  time: SharedValue<number>;
  /** Ignition sweep progress, 0→1 linear (smoothstep happens in-shader). */
  reveal: SharedValue<number>;
  /** Whole-field opacity, used to fade out before unmounting. */
  fieldAlpha: SharedValue<number>;
};

export function ThinkingPixelField({
  width,
  height,
  radius,
  palette,
  time,
  reveal,
  fieldAlpha,
}: ThinkingPixelFieldProps) {
  const uniforms = useDerivedValue(
    () => ({
      uResolution: [width, height],
      uTime: time.value,
      uReveal: reveal.value,
      uFieldAlpha: fieldAlpha.value,
      uLeft: palette.left,
      uHighlight: palette.highlight,
      uPeak: palette.peak,
      uChromaLo: palette.chromaLo,
      uChromaHi: palette.chromaHi,
      uBg: palette.bg,
      uPalette: palette.palette,
    }),
    [width, height, palette],
  );

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', width, height }}>
      <RoundedRect height={height} r={radius} width={width} x={0} y={0}>
        <Shader source={thinkingPixelFieldEffect} uniforms={uniforms} />
      </RoundedRect>
    </Canvas>
  );
}
