import { useEffect } from 'react';
import { type SharedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

/**
 * Drives a wrapped time value (seconds, [0, wrapSeconds)) for shader uniforms.
 * Unlike Skia's useClock it can pause (`active`), throttle (`fps`), and wraps
 * so sin()-based shader hashes never see huge arguments. Pick a wrap that
 * every period in the consuming shader divides exactly, so the wrap lands on
 * a seamless frame.
 */
export function useShaderClock(
  active: boolean,
  wrapSeconds: number,
  fps = 60,
): SharedValue<number> {
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
      time.value = (time.value + accumulatedMs.value / 1000) % wrapSeconds;
      accumulatedMs.value = 0;
    } else {
      time.value = (time.value + deltaMs / 1000) % wrapSeconds;
    }
  }, false);

  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);

  return time;
}
