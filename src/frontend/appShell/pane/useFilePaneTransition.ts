import { duration, easing } from '@cherrystudio/ui/motion';
import { useCallback, useEffect, useState } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * Only keyboard yielding fades. Space returns after the pane covers the full-height chat. A stale
 * snapshot keeps the pane as the last current one showed it, over a full-width chat: a pane cannot
 * appear from the previous screen's geometry, and a pane already on screen does not uncover the
 * chat while a display switch settles.
 */
export function useFilePaneTransition(
  isRequested: boolean,
  isYielding: boolean,
  isStacked: boolean,
  isLayoutCurrent: boolean,
) {
  const isReducedMotion = useReducedMotion();
  const [settled, setSettled] = useState(isRequested);
  if (isLayoutCurrent && settled !== isRequested) setSettled(isRequested);
  const isPresented = isLayoutCurrent ? isRequested : settled;
  const isVisible = isPresented && !isYielding;
  const opacity = useSharedValue(isVisible ? 1 : 0);
  const [transition, setTransition] = useState({
    isPresented,
    isYielding,
    isReducedMotion,
    isStacked,
    isLayoutCurrent,
    isAnimated: false,
    isRestoring: false,
    generation: 0,
  });

  if (
    transition.isPresented !== isPresented ||
    transition.isYielding !== isYielding ||
    transition.isStacked !== isStacked ||
    transition.isLayoutCurrent !== isLayoutCurrent ||
    transition.isReducedMotion !== isReducedMotion
  ) {
    const isAnimated =
      isPresented &&
      transition.isPresented &&
      isStacked &&
      transition.isStacked &&
      isLayoutCurrent &&
      transition.isLayoutCurrent &&
      isYielding !== transition.isYielding &&
      !isReducedMotion;
    // Decide before committing layout: an effect would reserve space for one frame too early.
    setTransition({
      isPresented,
      isYielding,
      isReducedMotion,
      isStacked,
      isLayoutCurrent,
      isAnimated,
      isRestoring: isAnimated && !isYielding,
      generation: transition.generation + 1,
    });
  }

  const finishRestore = useCallback((generation: number) => {
    setTransition((current) =>
      current.generation === generation && current.isRestoring
        ? { ...current, isRestoring: false }
        : current,
    );
  }, []);
  const { generation, isAnimated } = transition;
  useEffect(() => {
    if (isAnimated) {
      opacity.set(
        withTiming(
          isVisible ? 1 : 0,
          { duration: duration.fast, easing: easing.settle },
          (finished) => {
            if (finished && isVisible) scheduleOnRN(finishRestore, generation);
          },
        ),
      );
    } else {
      opacity.set(isVisible ? 1 : 0);
    }
    return () => cancelAnimation(opacity);
  }, [finishRestore, generation, isAnimated, isVisible, opacity]);

  const style = useAnimatedStyle(() => ({
    // Open/close and availability changes are immediate even before the effect updates opacity.
    opacity: isAnimated ? opacity.get() : isVisible ? 1 : 0,
  }));
  // Space is reserved only from a current snapshot. The previous screen's split can be wider than
  // the new window, and a chat squeezed by it during a display switch keeps that width natively.
  return {
    hasSpace: isLayoutCurrent && isPresented && !isYielding && !transition.isRestoring,
    isVisible,
    style,
  };
}
