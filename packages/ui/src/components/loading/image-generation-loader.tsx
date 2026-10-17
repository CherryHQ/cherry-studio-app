import { Canvas, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, type ViewProps, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { cn } from '../../utils/cn';
import { getImageGenerationLoaderEffect } from './image-generation-loader-effect';

const DEFAULT_SIZE = 208;
// 500 complete 2.4-second light cycles.
const CLOCK_WRAP_SECONDS = 1200;

export type ImageGenerationLoaderProps = Omit<ViewProps, 'children'> &
  Readonly<{
    /** Runs the loader while true and shows its static state otherwise. */
    active?: boolean;
    /** Preview height in points. Defaults to `size`. */
    height?: number;
    /** Square fallback used when `width` or `height` is not provided. */
    size?: number;
    /** Preview width in points. Defaults to `size`. */
    width?: number;
  }>;

/**
 * Active generation shows a holo card: a pearl sheen with a white glare that
 * crosses it, revealing fine foil lines and sparkles. A UI-thread clock drives
 * one shader. Inactive/background states pause it; Reduce Motion keeps the
 * neutral canvas without the light.
 */
export function ImageGenerationLoader({
  accessibilityLabel = 'Generating image',
  active = true,
  className,
  height,
  size = DEFAULT_SIZE,
  width,
  ...props
}: ImageGenerationLoaderProps) {
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      setIsForeground(state === 'active');
    });
    const reduceMotion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      appState.remove();
      reduceMotion.remove();
    };
  }, []);
  const isAnimating = active && isForeground && !reducedMotion;
  const previewHeight = height ?? size;
  const previewWidth = width ?? size;
  const time = useLoaderClock(isAnimating);
  const surfaceColorValue = useCSSVariable('--color-background');
  const foilEffect = getImageGenerationLoaderEffect();
  const surfaceColor = useMemo(
    () => Skia.Color(surfaceColorValue ?? '#f5f5f5'),
    [surfaceColorValue],
  );

  const uniforms = useDerivedValue(
    () => ({
      uResolution: [previewWidth, previewHeight],
      uStatic: isAnimating ? 0 : 1,
      uSurfaceColor: surfaceColor,
      uTime: time.get(),
    }),
    [isAnimating, previewHeight, previewWidth, surfaceColor, time],
  );

  return (
    <View
      {...props}
      accessibilityLabel={accessibilityLabel}
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
            <Shader source={foilEffect} uniforms={uniforms} />
          </Rect>
        </Canvas>
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
