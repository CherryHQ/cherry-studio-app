import { Canvas, ImageShader, Rect, Shader, type SkImage } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { type DerivedValue, useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import { paintingSkeleton } from '@/config/constants';
import { useShaderClock } from '@/hooks/useShaderClock';

import { paintingSkeletonGridEffect } from '../shaders/paintingSkeletonGrid';
import { paintingSkeletonRevealEffect } from '../shaders/paintingSkeletonReveal';
import { measurePaintingSkeletonGrid } from '../utils/gridLayout';

type PaintingSkeletonProps = {
  /** Result image to reveal into; omit for a pure loading grid (Act 1 only). */
  image?: SkImage | null;
  /** Reveal seconds; < 0 means pure Act 1 loading. Required when `image` is set. */
  reveal?: DerivedValue<number>;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Loading grid skeleton for painting/drawing surfaces (desktop paintings
 * parity). Without an image it draws the Act 1 loading grid whose brightness
 * peak sweeps diagonally. With an `image` + `reveal` driver it plays the full
 * Act 1-4 lifecycle: loading → tint → slice → heal into the finished image.
 * The animation math lives in the SkSL shaders; Reduce Motion parks on a
 * static snapshot (grid or finished image) with the clock stopped.
 */
export function PaintingSkeleton({
  image,
  reveal,
  accessibilityLabel = 'Loading',
  testID,
}: PaintingSkeletonProps) {
  const reducedMotion = useReducedMotion();
  // useUniwind, not useColorScheme: the app theme preference can pin dark/light
  // independently of the system appearance.
  const { theme } = useUniwind();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const grid = useMemo(() => measurePaintingSkeletonGrid(size.width, size.height), [size]);
  const time = useShaderClock(grid !== null && !reducedMotion, paintingSkeleton.periodSeconds);

  const foreground = paintingSkeleton.foreground[theme === 'dark' ? 'dark' : 'light'];
  const cols = grid?.cols ?? 1;
  const rows = grid?.rows ?? 1;
  const cellWidth = grid?.cellWidth ?? 0;
  const cellHeight = grid?.cellHeight ?? 0;
  const innerWidth = grid?.innerWidth ?? 0;
  const innerHeight = grid?.innerHeight ?? 0;
  const staticSnapshot = reducedMotion ? 1 : 0;

  const gridUniforms = useDerivedValue(
    () => ({
      uTime: time.value,
      uGrid: [cols, rows],
      uCell: [cellWidth, cellHeight],
      uColor: foreground,
      uStatic: staticSnapshot,
    }),
    [cols, rows, cellWidth, cellHeight, foreground, staticSnapshot],
  );

  const revealUniforms = useDerivedValue(
    () => ({
      uTime: time.value,
      uGrid: [cols, rows],
      uCell: [cellWidth, cellHeight],
      uInner: [innerWidth, innerHeight],
      uColor: foreground,
      uReveal: reveal?.value ?? -1,
    }),
    [cols, rows, cellWidth, cellHeight, innerWidth, innerHeight, foreground, reveal],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessible
      className="flex-1 overflow-hidden rounded-md bg-surface-secondary"
      onLayout={handleLayout}
      testID={testID}
    >
      {grid ? (
        <Canvas
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: paintingSkeleton.gap,
            top: paintingSkeleton.gap,
            width: grid.innerWidth,
            height: grid.innerHeight,
          }}
        >
          <Rect height={grid.innerHeight} width={grid.innerWidth} x={0} y={0}>
            {image ? (
              <Shader source={paintingSkeletonRevealEffect} uniforms={revealUniforms}>
                <ImageShader
                  fit="fill"
                  image={image}
                  rect={{ x: 0, y: 0, width: grid.innerWidth, height: grid.innerHeight }}
                  tx="clamp"
                  ty="clamp"
                />
              </Shader>
            ) : (
              <Shader source={paintingSkeletonGridEffect} uniforms={gridUniforms} />
            )}
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}
