import { type Ref, useCallback, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { homeAiUsageCalendar } from '@/frontend/utils/constants';

import type { AiUsageAnimationControls, AiUsageLevel } from '../types';
import { getAiUsageSweepDelayMs } from '../utils/aiUsageCalendar';

type AiUsageSquareProps = {
  dayIndex: number;
  level: AiUsageLevel;
  levelColors: readonly string[];
  ref: Ref<AiUsageAnimationControls>;
  weekIndex: number;
};

export function AiUsageSquare({
  dayIndex,
  level,
  levelColors,
  ref,
  weekIndex,
}: AiUsageSquareProps) {
  const progress = useSharedValue(0);
  const restingColor = levelColors[0];
  const activeColor = levelColors[level];

  const startAnimation = useCallback(() => {
    cancelAnimation(progress);
    progress.set(
      withDelay(
        getAiUsageSweepDelayMs(weekIndex, dayIndex),
        withSpring(1, homeAiUsageCalendar.enterSpring),
      ),
    );
  }, [dayIndex, progress, weekIndex]);

  const resetAnimation = useCallback(() => {
    cancelAnimation(progress);
    progress.set(
      withDelay(
        Math.random() * homeAiUsageCalendar.resetMaxDelayMs,
        withSpring(0, homeAiUsageCalendar.exitSpring),
      ),
    );
  }, [progress]);

  useImperativeHandle(ref, () => ({ resetAnimation, startAnimation }), [
    resetAnimation,
    startAnimation,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(progress.get(), [0, 1], [restingColor, activeColor], 'RGB'),
      // Deliberately unclamped: the spring overshoots past 1, so the square
      // pops slightly above full size before settling.
      transform: [{ scale: interpolate(progress.get(), [0, 0.5, 1], [1, 0.4, 1]) }],
    };
  }, [activeColor, restingColor]);

  return <Animated.View style={[styles.square, animatedStyle]} />;
}

const styles = StyleSheet.create({
  square: {
    borderCurve: 'continuous',
    borderRadius: homeAiUsageCalendar.cellRadius,
    height: homeAiUsageCalendar.cellSize,
    width: homeAiUsageCalendar.cellSize,
  },
});
