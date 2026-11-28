import { duration, easing } from '@cherrystudio/ui/motion';
import { useEffect } from 'react';
import {
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export function useBreathingOpacity({
  active,
  minOpacity = 0.28,
  maxOpacity = 0.65,
  restingOpacity = 0.28,
  durationMs = 1300,
}: {
  active: boolean;
  minOpacity?: number;
  maxOpacity?: number;
  restingOpacity?: number;
  durationMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(restingOpacity);

  useEffect(() => {
    if (active && !reduceMotion) {
      opacity.set(minOpacity);
      opacity.set(
        withRepeat(
          withTiming(maxOpacity, { duration: durationMs, easing: easing.inOut }),
          -1,
          true,
        ),
      );
    } else {
      opacity.set(
        reduceMotion ? restingOpacity : withTiming(restingOpacity, { duration: duration.fast }),
      );
    }
    return () => cancelAnimation(opacity);
  }, [active, durationMs, maxOpacity, minOpacity, opacity, reduceMotion, restingOpacity]);

  return opacity;
}
