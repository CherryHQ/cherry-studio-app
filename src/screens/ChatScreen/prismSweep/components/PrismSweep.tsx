import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { buildDiagonalSweepOrder } from '../utils/diagonalSweepOrder';
import { PrismSweepDot } from './PrismSweepDot';

const GRID_SIZE = 5;
const DOT_COUNT = GRID_SIZE * GRID_SIZE;
const DOT_DIAMETER_RATIO = 0.6;
const SWEEP_ORDER = buildDiagonalSweepOrder(GRID_SIZE);

export type PrismSweepProps = {
  /** Runs the sweep while true; settles every dot to a dim, static grid otherwise. */
  active?: boolean;
  accessibilityLabel?: string;
  /** Tailwind classes controlling dot color/appearance, e.g. `"bg-primary"`. */
  dotClassName?: string;
  /** Full sweep cycle duration in milliseconds. */
  durationMs?: number;
  /** Overall square size in points. */
  size?: number;
};

export function PrismSweep({
  active = true,
  accessibilityLabel = 'Loading',
  dotClassName = 'bg-default-foreground',
  durationMs = 1400,
  size = 20,
}: PrismSweepProps) {
  const reducedMotion = useReducedMotion();
  const isAnimating = active && !reducedMotion;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isAnimating) {
      progress.set(0);
      progress.set(
        withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false),
      );
    } else {
      cancelAnimation(progress);
    }

    return () => cancelAnimation(progress);
  }, [durationMs, isAnimating, progress]);

  const cellSize = size / GRID_SIZE;
  const dotSize = cellSize * DOT_DIAMETER_RATIO;

  const dots = useMemo(
    () => Array.from({ length: DOT_COUNT }, (_, index) => SWEEP_ORDER[index] / (DOT_COUNT - 1)),
    [],
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessible
      style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap' }}
    >
      {dots.map((orderFraction) => (
        <View
          key={orderFraction}
          style={{
            width: cellSize,
            height: cellSize,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PrismSweepDot
            className={dotClassName}
            isAnimating={isAnimating}
            orderFraction={orderFraction}
            progress={progress}
            size={dotSize}
          />
        </View>
      ))}
    </View>
  );
}
