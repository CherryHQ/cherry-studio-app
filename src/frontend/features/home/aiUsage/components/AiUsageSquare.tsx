import { type Ref, useCallback, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { aiUsageCalendar } from '@/frontend/utils/constants';

import type { AiUsageAnimationControls, AiUsageLevel } from '../types';
import { getAiUsageSweepDelayMs } from '../utils/aiUsageCalendar';

type AiUsageSquareProps = {
  cellSize: number;
  dayIndex: number;
  isHighlighted: boolean;
  level: AiUsageLevel;
  levelColors: readonly string[];
  ref: Ref<AiUsageAnimationControls>;
  weekIndex: number;
};

export function AiUsageSquare({
  cellSize,
  dayIndex,
  isHighlighted,
  level,
  levelColors,
  ref,
  weekIndex,
}: AiUsageSquareProps) {
  const progress = useSharedValue(0);
  const restingColor = levelColors[0];
  const activeColor = levelColors[level];

  const replayAnimation = useCallback(() => {
    cancelAnimation(progress);
    if (!isHighlighted) {
      progress.set(1);
      return;
    }

    progress.set(0);
    progress.set(
      withDelay(
        getAiUsageSweepDelayMs(weekIndex, dayIndex),
        withSpring(1, aiUsageCalendar.enterSpring),
      ),
    );
  }, [dayIndex, isHighlighted, progress, weekIndex]);

  useImperativeHandle(ref, () => ({ replayAnimation }), [replayAnimation]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      // Deliberately unclamped: the spring overshoots past 1, so the square
      // pops slightly above full size before settling.
      transform: [{ scale: interpolate(progress.get(), [0, 0.5, 1], [1, 0.4, 1]) }],
    };
  });
  const animatedActiveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[
        styles.square,
        { backgroundColor: restingColor, height: cellSize, width: cellSize },
        !isHighlighted && styles.dimmed,
        animatedContainerStyle,
      ]}
    >
      <Animated.View
        style={[styles.activeSquare, { backgroundColor: activeColor }, animatedActiveStyle]}
        testID="ai-usage-square-active-layer"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  activeSquare: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dimmed: {
    opacity: aiUsageCalendar.dimmedOpacity,
  },
  square: {
    borderCurve: 'continuous',
    borderRadius: aiUsageCalendar.cellRadius,
    overflow: 'hidden',
  },
});
