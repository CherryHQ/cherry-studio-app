import { useEffect, useMemo } from 'react';
import { StyleSheet, type ViewStyle, View } from 'react-native';
import Animated, {
  cancelAnimation,
  type DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { easing } from '../../motion';

export const DOT_MATRIX_SIZE = 5;
export const DOT_MATRIX_CELL_COUNT = DOT_MATRIX_SIZE * DOT_MATRIX_SIZE;

const DOT_DIAMETER_RATIO = 0.6;

const CELL_COORDINATES = Array.from({ length: DOT_MATRIX_CELL_COUNT }, (_, index) => ({
  column: index % DOT_MATRIX_SIZE,
  index,
  row: Math.floor(index / DOT_MATRIX_SIZE),
}));

export type DotMatrixLoaderProps = Readonly<{
  /** Runs the loader while true and shows its static state otherwise. */
  active?: boolean;
  accessibilityLabel?: string;
  /** Complete Tailwind background class for the dots, for example `bg-primary`. */
  dotClassName?: string;
  /** Overall square size in points. */
  size?: number;
}>;

type DotMatrixBaseProps = DotMatrixLoaderProps &
  Readonly<{
    cycleDurationMs: number;
    frameOpacities: readonly number[];
    idleOpacities: readonly number[];
  }>;

type DotLayout = Readonly<{
  index: number;
  style: ViewStyle;
}>;

type DotMatrixDotProps = Readonly<{
  className: string;
  currentFrame: DerivedValue<number>;
  frameOpacities: readonly number[];
  idleOpacities: readonly number[];
  index: number;
  isAnimating: boolean;
  style: ViewStyle;
}>;

export function DotMatrixBase({
  active = true,
  accessibilityLabel = 'Loading',
  cycleDurationMs,
  dotClassName = 'bg-foreground',
  frameOpacities,
  idleOpacities,
  size = 20,
}: DotMatrixBaseProps) {
  const reducedMotion = useReducedMotion();
  const isAnimating = active && !reducedMotion;
  const progress = useSharedValue(0);
  const frameCount = frameOpacities.length / DOT_MATRIX_CELL_COUNT;
  const currentFrame = useDerivedValue(() => {
    if (!isAnimating || frameCount === 0) return 0;
    return Math.floor(progress.get() * frameCount) % frameCount;
  }, [frameCount, isAnimating]);

  useEffect(() => {
    if (isAnimating) {
      progress.set(0);
      progress.set(
        withRepeat(withTiming(1, { duration: cycleDurationMs, easing: easing.linear }), -1, false),
      );
    } else {
      cancelAnimation(progress);
    }

    return () => cancelAnimation(progress);
  }, [cycleDurationMs, isAnimating, progress]);

  const dotLayouts = useMemo<DotLayout[]>(() => {
    const cellSize = size / DOT_MATRIX_SIZE;
    const dotSize = cellSize * DOT_DIAMETER_RATIO;
    const dotInset = (cellSize - dotSize) / 2;

    return CELL_COORDINATES.map(({ column, index, row }) => ({
      index,
      style: {
        borderRadius: dotSize / 2,
        height: dotSize,
        left: column * cellSize + dotInset,
        position: 'absolute',
        top: row * cellSize + dotInset,
        width: dotSize,
      },
    }));
  }, [size]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessible
      style={[styles.container, { height: size, width: size }]}
    >
      {dotLayouts.map((dot) => (
        <DotMatrixDot
          className={dotClassName}
          currentFrame={currentFrame}
          frameOpacities={frameOpacities}
          idleOpacities={idleOpacities}
          index={dot.index}
          isAnimating={isAnimating}
          key={dot.index}
          style={dot.style}
        />
      ))}
    </View>
  );
}

function DotMatrixDot({
  className,
  currentFrame,
  frameOpacities,
  idleOpacities,
  index,
  isAnimating,
  style,
}: DotMatrixDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const idleOpacity = idleOpacities[index] ?? 0;
    if (!isAnimating) return { opacity: idleOpacity };

    const frameIndex = currentFrame.get() * DOT_MATRIX_CELL_COUNT + index;
    return { opacity: frameOpacities[frameIndex] ?? idleOpacity };
  }, [currentFrame, frameOpacities, idleOpacities, index, isAnimating]);

  return <Animated.View className={className} style={[style, animatedStyle]} />;
}

export function rowMajorIndex(row: number, column: number): number {
  return row * DOT_MATRIX_SIZE + column;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
});
