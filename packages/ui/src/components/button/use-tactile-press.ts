import { useEffect, useRef } from 'react';
import {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { pressMotion } from '../../motion';

type UseTactilePressOptions = {
  disabled?: boolean;
  scaleTo?: number;
};

const PRESS_IN_CONFIG = {
  ...pressMotion.pressIn,
  reduceMotion: ReduceMotion.System,
} as const;

const PRESS_OUT_CONFIG = {
  ...pressMotion.pressOut,
  reduceMotion: ReduceMotion.System,
} as const;

/**
 * Drives immediate UI-thread press-in scale and soft spring recovery without
 * triggering React re-renders. Uses a JS press ref rather than comparing the
 * shared value so fast taps cannot get stuck scaled down.
 */
export function useTactilePress({
  disabled = false,
  scaleTo = pressMotion.scale,
}: UseTactilePressOptions = {}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const isPressedRef = useRef(false);
  const isInteractive = !disabled && !reducedMotion && scaleTo !== 1;

  useEffect(() => {
    if (!isInteractive && isPressedRef.current) {
      isPressedRef.current = false;
      scale.set(1);
    }
  }, [isInteractive, scale]);

  const handlePressIn = () => {
    if (!isInteractive) {
      return;
    }
    isPressedRef.current = true;
    scale.set(withTiming(scaleTo, PRESS_IN_CONFIG));
  };

  const handlePressOut = () => {
    if (!isPressedRef.current) {
      return;
    }
    isPressedRef.current = false;
    scale.set(reducedMotion ? 1 : withSpring(1, PRESS_OUT_CONFIG));
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
  };
}
