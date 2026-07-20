import { useState } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { THINKING_FADE_OUT_MS, THINKING_REVEAL_DURATION_MS } from '../utils/constants';

export type ThinkingReveal = {
  /** Gates the Canvas mount so idle stops carry zero GPU/CPU cost. */
  fieldMounted: boolean;
  /** Linear 0→1 ignition progress (smoothstep happens in-shader). */
  reveal: SharedValue<number>;
  /** Whole-field opacity; fades out before unmount. */
  fieldAlpha: SharedValue<number>;
};

/**
 * Ignition state machine for the pixel field: entering the trigger stop
 * mounts the canvas and plays the 1 s reveal sweep (fires mid-drag, before
 * release); leaving fades the whole field out and then unmounts it.
 * `initiallyAtTrigger` pre-lights the field (no sweep) so remounting at the
 * trigger stop — e.g. reopening the panel at max — shows it already lit
 * instead of flashing ticks and replaying the ignition.
 */
export function useThinkingReveal(
  activeStopIndex: SharedValue<number>,
  triggerStopIndex: number,
  enabled: boolean,
  initiallyAtTrigger = false,
): ThinkingReveal {
  const startLit = initiallyAtTrigger && enabled && triggerStopIndex >= 0;
  const [fieldMounted, setFieldMounted] = useState(startLit);
  const reveal = useSharedValue(startLit ? 1 : 0);
  const fieldAlpha = useSharedValue(startLit ? 1 : 0);

  useAnimatedReaction(
    () => enabled && triggerStopIndex >= 0 && activeStopIndex.value === triggerStopIndex,
    (atTrigger, previous) => {
      // previous 为 null 是 reaction 首次运行（挂载/依赖重建），此时以预点亮
      // 状态为基准，避免把「本来就在触发挡」当成一次进入而重放扫入。
      if (atTrigger === (previous ?? startLit)) {
        return;
      }
      if (atTrigger) {
        runOnJS(setFieldMounted)(true);
        cancelAnimation(fieldAlpha);
        fieldAlpha.value = 1;
        reveal.value = 0;
        reveal.value = withTiming(1, {
          duration: THINKING_REVEAL_DURATION_MS,
          easing: Easing.linear,
        });
      } else {
        cancelAnimation(reveal);
        fieldAlpha.value = withTiming(0, { duration: THINKING_FADE_OUT_MS }, (finished) => {
          if (finished) {
            runOnJS(setFieldMounted)(false);
          }
        });
      }
    },
    [enabled, triggerStopIndex, startLit],
  );

  return { fieldMounted, reveal, fieldAlpha };
}
