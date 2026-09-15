import { Canvas, Rect, Shader, Skia, type SkColor } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, type ViewProps, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useCSSVariable, useResolveClassNames } from 'uniwind';

import { cn } from '../../utils/cn';
import { ShimmerText } from '../shimmer-text';
import { getImageGenerationLoaderEffect } from './image-generation-loader-effect';

const DEFAULT_SIZE = 208;
// Wrap after 250 complete glare cycles, while the reflection is off-canvas.
const CLOCK_WRAP_SECONDS = 1200;

const FIELD_COLOR_VARIABLES = ['--color-foreground-tertiary', '--color-muted-foreground'];

export type ImageGenerationLoaderProps = Omit<ViewProps, 'children'> &
  Readonly<{
    /** Runs the loader while true and shows its static state otherwise. */
    active?: boolean;
    /** Preview height in points. Defaults to `size`. */
    height?: number;
    /** Visible status text. Pass a translated value at product call sites. */
    label?: string;
    /** Resolution text; omitted when the requested size is not known. */
    resolution?: string;
    /** Square fallback used when `width` or `height` is not provided. */
    size?: number;
    /** Preview width in points. Defaults to `size`. */
    width?: number;
  }>;

export function ImageGenerationLoader({
  accessibilityLabel,
  active = true,
  className,
  height,
  label = 'Generating image',
  resolution,
  size = DEFAULT_SIZE,
  width,
  ...props
}: ImageGenerationLoaderProps) {
  const reducedMotion = useReducedMotion();
  const isAnimating = active && !reducedMotion;
  const previewHeight = height ?? size;
  const previewWidth = width ?? size;
  const time = useLoaderClock(isAnimating);
  const colorValues = useCSSVariable(FIELD_COLOR_VARIABLES);
  const baseColorValue = colorValues[0];
  const glowColorValue = colorValues[1];
  const glareStyle = useResolveClassNames('bg-constant-white/60 dark:bg-constant-white/10');
  const glareColorValue =
    typeof glareStyle.backgroundColor === 'string' ? glareStyle.backgroundColor : undefined;
  const dotFieldEffect = getImageGenerationLoaderEffect();
  const [baseColor, glowColor, glareColor] = useMemo(
    () => [
      resolveSkiaColor(baseColorValue, '#a1a1a1'),
      resolveSkiaColor(glowColorValue, '#a1a1a1'),
      resolveSkiaColor(glareColorValue, 'transparent'),
    ],
    [baseColorValue, glowColorValue, glareColorValue],
  );

  const uniforms = useDerivedValue(
    () => ({
      uBaseColor: baseColor,
      uGlowColor: glowColor,
      uGlareColor: glareColor,
      uResolution: [previewWidth, previewHeight],
      uStatic: isAnimating ? 0 : 1,
      uTime: time.get(),
    }),
    [baseColor, glowColor, glareColor, isAnimating, previewHeight, previewWidth, time],
  );

  const spokenLabel = accessibilityLabel ?? (resolution ? `${label}. ${resolution}` : label);

  return (
    <View
      {...props}
      accessibilityLabel={spokenLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: active }}
      className={cn('items-center', className)}
    >
      <View
        className="relative overflow-hidden rounded-xl border border-border-subtle border-continuous bg-secondary"
        pointerEvents="none"
        style={{ height: previewHeight, width: previewWidth }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect height={previewHeight} width={previewWidth} x={0} y={0}>
            <Shader source={dotFieldEffect} uniforms={uniforms} />
          </Rect>
        </Canvas>
        {resolution ? (
          <View className="absolute right-3 top-3">
            <Text className="font-mono text-xs text-muted-foreground" numberOfLines={1} selectable>
              {resolution}
            </Text>
          </View>
        ) : null}
        <View className="absolute bottom-3 left-3">
          <ShimmerText active={active} className="font-mono text-xs" numberOfLines={1}>
            {label}
          </ShimmerText>
        </View>
      </View>
    </View>
  );
}

function useLoaderClock(active: boolean) {
  const time = useSharedValue(0);
  const frame = useFrameCallback((frameInfo) => {
    'worklet';
    const deltaSeconds = Math.min(frameInfo.timeSincePreviousFrame ?? 0, 64) / 1000;
    time.set((time.get() + deltaSeconds) % CLOCK_WRAP_SECONDS);
  }, false);

  useEffect(() => {
    frame.setActive(active);
    if (!active) time.set(0);

    return () => frame.setActive(false);
  }, [active, frame, time]);

  return time;
}

function resolveSkiaColor(value: number | string | undefined, fallback: string): SkColor {
  return Skia.Color(value ?? fallback);
}
