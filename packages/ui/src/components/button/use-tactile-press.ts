import { useLayoutEffect, useRef } from 'react';
import {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { pressMotion } from '../../motion';
import { useButtonReducedMotion } from './use-button-reduced-motion';

type UseTactilePressOptions = {
  disabled?: boolean;
  scaleTo?: number;
};

// The live system preference below gates both animations, including after a runtime toggle.
const PRESS_IN_CONFIG = { ...pressMotion.pressIn, reduceMotion: ReduceMotion.Never } as const;
const PRESS_OUT_CONFIG = { ...pressMotion.pressOut, reduceMotion: ReduceMotion.Never } as const;

/**
 * Drives immediate UI-thread press-in scale and soft spring recovery without
 * triggering React re-renders. Uses a JS press ref rather than comparing the
 * shared value so fast taps cannot get stuck scaled down.
 */
export function useTactilePress({
  disabled = false,
  scaleTo = pressMotion.scale,
}: UseTactilePressOptions = {}) {
  const reducedMotion = useButtonReducedMotion();
  const scale = useSharedValue(1);
  const isPressedRef = useRef(false);
  const isInteractive = !disabled && !reducedMotion && scaleTo !== 1;

  useLayoutEffect(() => {
    if (reducedMotion) {
      isPressedRef.current = false;
      scale.set(1);
    } else if (!isInteractive && isPressedRef.current) {
      isPressedRef.current = false;
      scale.set(withSpring(1, PRESS_OUT_CONFIG));
    }
  }, [isInteractive, reducedMotion, scale]);

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
    scale.set(withSpring(1, PRESS_OUT_CONFIG));
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
