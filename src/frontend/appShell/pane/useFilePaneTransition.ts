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

/** Only keyboard yielding fades. Space returns after the pane covers the full-height chat. */
export function useFilePaneTransition(
  isPresented: boolean,
  isYielding: boolean,
  isStacked: boolean,
  isLayoutCurrent: boolean,
) {
  const isReducedMotion = useReducedMotion();
  const isVisible = isPresented && !isYielding && isLayoutCurrent;
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
  // A stale snapshot hides the pane without making a second, speculative chat layout.
  return { hasSpace: isPresented && !isYielding && !transition.isRestoring, isVisible, style };
}
