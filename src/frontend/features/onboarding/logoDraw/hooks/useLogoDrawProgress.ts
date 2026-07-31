import { useCallback, useEffect, useRef } from 'react';
import {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { checkSpringConfig, LOGO_DRAW_SEGMENTS, logoDrawTiming } from '../utils/constants';

type UseLogoDrawProgressOptions = {
  /** Master progress the timeline drives (or only observes when controlled). */
  progress: SharedValue<number>;
  /** True when the caller supplies an external progress value. */
  controlled: boolean;
  /** Start the timeline on mount (uncontrolled mode only). */
  autoPlay: boolean;
  /** Fires once on the JS thread when the draw reaches the end. */
  onSettle: () => void;
};

/**
 * Drives the master progress: the orange phase is one ease-in-out ramp up to
 * the check segment, then a spring lands (and slightly overshoots) the green
 * check. Returns `play`, which (re)starts the timeline from zero.
 *
 * In controlled mode nothing is driven; `onSettle` fires each time the
 * external progress crosses 1 from below.
 */
export function useLogoDrawProgress({
  progress,
  controlled,
  autoPlay,
  onSettle,
}: UseLogoDrawProgressOptions): () => void {
  // Keep the settle callback identity-stable so play() and the animated
  // reaction never rebuild when the caller passes a fresh closure.
  const settleRef = useRef(onSettle);
  useEffect(() => {
    settleRef.current = onSettle;
  }, [onSettle]);
  const settle = useCallback(() => settleRef.current(), []);

  const play = useCallback(() => {
    if (controlled) {
      return;
    }
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withSequence(
      withTiming(LOGO_DRAW_SEGMENTS.check.from, logoDrawTiming),
      withSpring(1, checkSpringConfig, (settled) => {
        if (settled) {
          runOnJS(settle)();
        }
      }),
    );
  }, [controlled, progress, settle]);

  useEffect(() => {
    if (autoPlay && !controlled) {
      play();
    }
  }, [autoPlay, controlled, play]);

  useAnimatedReaction(
    () => progress.value >= 1,
    (atEnd, previous) => {
      if (controlled && atEnd && previous === false) {
        runOnJS(settle)();
      }
    },
    [controlled, progress],
  );

  return play;
}
