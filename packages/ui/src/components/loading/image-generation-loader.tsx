import { Canvas, Rect, Shader, Skia, type SkColor } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, type LayoutChangeEvent, type ViewProps, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { cn } from '../../utils/cn';
import { getImageGenerationLoaderEffect } from './image-generation-loader-effect';

const DEFAULT_SIZE = 208;
const CLOCK_WRAP_SECONDS = 1197;
const SHINE_PERIOD_SECONDS = 2.25;
const SHINE_BAND_WIDTH = 36;

const FIELD_COLOR_VARIABLES = ['--color-foreground-tertiary', '--color-foreground'];

export type ImageGenerationLoaderProps = Omit<ViewProps, 'children'> &
  Readonly<{
    /** Runs the loader while true and shows its static state otherwise. */
    active?: boolean;
    /** Visible status text. Pass a translated value at product call sites. */
    label?: string;
    prompt?: string;
    resolution?: string;
    /** Width and height of the square preview in points. */
    size?: number;
  }>;

export function ImageGenerationLoader({
  accessibilityLabel,
  active = true,
  className,
  label = 'Generating image',
  prompt = 'a calm mountain lake at dawn',
  resolution = '1024 \u00d7 1024',
  size = DEFAULT_SIZE,
  ...props
}: ImageGenerationLoaderProps) {
  const reducedMotion = useReducedMotion();
  const isAnimating = active && !reducedMotion;
  const time = useLoaderClock(isAnimating);
  const labelWidth = useSharedValue(0);
  const colorValues = useCSSVariable(FIELD_COLOR_VARIABLES);
  const baseColorValue = colorValues[0];
  const glowColorValue = colorValues[1];
  const dotFieldEffect = useMemo(getImageGenerationLoaderEffect, []);
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
      uResolution: [size, size],
      uStatic: isAnimating ? 0 : 1,
      uTime: time.get(),
    }),
    [baseColor, glowColor, isAnimating, size, time],
  );

  const shineOffset = useDerivedValue(() => {
    const width = labelWidth.get();
    if (!isAnimating || width <= 0) return -SHINE_BAND_WIDTH;

    const phase = (time.get() % SHINE_PERIOD_SECONDS) / SHINE_PERIOD_SECONDS;
    if (phase <= 0.18) return -SHINE_BAND_WIDTH;
    if (phase >= 0.82) return width;

    const progress = (phase - 0.18) / 0.64;
    const easedProgress = progress * progress * (3 - 2 * progress);
    return -SHINE_BAND_WIDTH + (width + SHINE_BAND_WIDTH) * easedProgress;
  }, [isAnimating, labelWidth, time]);

  const shineBandStyle = useAnimatedStyle(
    () => ({
      opacity: isAnimating ? 1 : 0,
      transform: [{ translateX: shineOffset.get() }],
    }),
    [isAnimating, shineOffset],
  );
  const shineTextStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: -shineOffset.get() }] }),
    [shineOffset],
  );

  const handleLabelLayout = (event: LayoutChangeEvent) => {
    labelWidth.set(event.nativeEvent.layout.width);
  };

  const spokenLabel = accessibilityLabel ?? `${label}: ${prompt}. ${resolution}`;

  return (
    <View
      {...props}
      accessibilityLabel={spokenLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: active }}
      accessible
      className={cn('items-center gap-3.5', className)}
    >
      <View
        className="relative overflow-hidden rounded-xl border-continuous bg-background-subtle"
        pointerEvents="none"
        style={{ height: size, width: size }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect height={size} width={size} x={0} y={0}>
            <Shader source={dotFieldEffect} uniforms={uniforms} />
          </Rect>
        </Canvas>
        <View className="absolute right-2 top-2 rounded-full bg-background/75 px-2 py-0.5">
          <Text className="font-mono text-xs text-foreground-tertiary" numberOfLines={1} selectable>
            {resolution}
          </Text>
        </View>
      </View>

      <View className="items-start gap-0.5" style={{ width: size }}>
        <View className="relative self-start">
          <Text
            className="text-sm font-semibold text-foreground"
            numberOfLines={1}
            onLayout={handleLabelLayout}
          >
            {label}
          </Text>
          <Animated.View
            accessibilityElementsHidden
            className="absolute inset-y-0 left-0 overflow-hidden"
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[{ width: SHINE_BAND_WIDTH }, shineBandStyle]}
          >
            <Animated.Text
              className="text-sm font-semibold text-foreground-tertiary"
              numberOfLines={1}
              style={shineTextStyle}
            >
              {label}
            </Animated.Text>
          </Animated.View>
        </View>
        <Text className="text-xs text-foreground-tertiary" numberOfLines={2} selectable>
          {'\u201c'}
          {prompt}
          {'\u201d'}
        </Text>
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
