import { useEffect } from 'react';
import { type SharedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { THINKING_CLOCK_WRAP_SECONDS } from '../utils/constants';

/**
 * Drives a wrapped time value (seconds, [0, THINKING_CLOCK_WRAP_SECONDS)) for
 * shader uniforms. Unlike Skia's useClock it can pause (`active`), throttle
 * (`fps`), and wraps so sin()-based shader hashes never see huge arguments.
 */
export function useShaderClock(active: boolean, fps = 60): SharedValue<number> {
  const time = useSharedValue(0);
  const accumulatedMs = useSharedValue(0);
  const throttleMs = fps >= 60 ? 0 : 1000 / fps;

  const frame = useFrameCallback((info) => {
    'worklet';
    // Clamp so the first frame after a pause doesn't jump the animation.
    const deltaMs = Math.min(info.timeSincePreviousFrame ?? 0, 64);
    if (throttleMs > 0) {
      accumulatedMs.value += deltaMs;
      if (accumulatedMs.value < throttleMs) {
        return;
      }
      time.value = (time.value + accumulatedMs.value / 1000) % THINKING_CLOCK_WRAP_SECONDS;
      accumulatedMs.value = 0;
    } else {
      time.value = (time.value + deltaMs / 1000) % THINKING_CLOCK_WRAP_SECONDS;
    }
  }, false);

  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);

  return time;
}
