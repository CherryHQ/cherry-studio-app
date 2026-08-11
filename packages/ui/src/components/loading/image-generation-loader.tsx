import { Canvas, Rect, Shader, Skia, type SkColor } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, type ViewProps, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { cn } from '../../utils/cn';
import { ShimmerText } from '../shimmer-text';
import { getImageGenerationLoaderEffect } from './image-generation-loader-effect';

const DEFAULT_SIZE = 208;
const CLOCK_WRAP_SECONDS = 1197;

const FIELD_COLOR_VARIABLES = ['--color-foreground-tertiary', '--color-foreground'];

export type ImageGenerationLoaderProps = Omit<ViewProps, 'children'> &
  Readonly<{
    /** Runs the loader while true and shows its static state otherwise. */
    active?: boolean;
    /** Preview height in points. Defaults to `size`. */
    height?: number;
    /** Visible status text. Pass a translated value at product call sites. */
    label?: string;
    /** Badge text; omitted when the requested size is not known. */
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
  const dotFieldEffect = getImageGenerationLoaderEffect();
  const [baseColor, glowColor] = useMemo(
    () => [
      resolveSkiaColor(baseColorValue, '#a1a1a1'),
      resolveSkiaColor(glowColorValue, '#1a1a1a'),
    ],
    [baseColorValue, glowColorValue],
  );

  const uniforms = useDerivedValue(
    () => ({
      uBaseColor: baseColor,
      uGlowColor: glowColor,
      uResolution: [previewWidth, previewHeight],
      uStatic: isAnimating ? 0 : 1,
      uTime: time.get(),
    }),
    [baseColor, glowColor, isAnimating, previewHeight, previewWidth, time],
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
        className="relative overflow-hidden rounded-xl border border-border border-continuous bg-card"
        pointerEvents="none"
        style={{ height: previewHeight, width: previewWidth }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect height={previewHeight} width={previewWidth} x={0} y={0}>
            <Shader source={dotFieldEffect} uniforms={uniforms} />
          </Rect>
        </Canvas>
        {resolution ? (
          <View className="absolute right-2 top-2 rounded-full border border-border bg-background/75 px-2 py-0.5">
            <Text className="font-mono text-xs text-foreground" numberOfLines={1} selectable>
              {resolution}
            </Text>
          </View>
        ) : null}
        <View className="absolute bottom-2 left-2">
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
