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

import { homeActivityCalendar } from '@/config/constants';

import type { ActivityAnimationControls, ActivityLevel } from '../types';
import { getActivitySweepDelayMs } from '../utils/calendarLayout';

type ActivitySquareProps = {
  dayIndex: number;
  level: ActivityLevel;
  ref: Ref<ActivityAnimationControls>;
  weekIndex: number;
};

export function ActivitySquare({ dayIndex, level, ref, weekIndex }: ActivitySquareProps) {
  const progress = useSharedValue(0);
  const restingColor = homeActivityCalendar.levelColors[0];
  const activeColor = homeActivityCalendar.levelColors[level];

  const startAnimation = useCallback(() => {
    cancelAnimation(progress);
    progress.set(
      withDelay(
        getActivitySweepDelayMs(weekIndex, dayIndex),
        withSpring(1, homeActivityCalendar.enterSpring),
      ),
    );
  }, [dayIndex, progress, weekIndex]);

  const resetAnimation = useCallback(() => {
    cancelAnimation(progress);
    progress.set(
      withDelay(
        Math.random() * homeActivityCalendar.resetMaxDelayMs,
        withSpring(0, homeActivityCalendar.exitSpring),
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
    borderRadius: homeActivityCalendar.cellRadius,
    height: homeActivityCalendar.cellSize,
    width: homeActivityCalendar.cellSize,
  },
});
