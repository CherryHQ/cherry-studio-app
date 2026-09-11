import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { effortSliderMagnetRadius, effortSliderSnapTiming } from '../utils/constants';
import {
  magnetize,
  nearestStopIndex,
  stopFraction,
  trackXToFraction,
} from '../utils/effortSliderMath';

type EffortSliderGestureConfig = {
  stopCount: number;
  initialIndex: number;
  disabled: boolean;
  reducedMotion: boolean;
  thumbCenterInset: number;
  /** Called on the JS thread when a gesture completes with a new stop. */
  onCommit: (index: number) => void;
};

export type EffortSliderGesture = {
  gesture: ReturnType<typeof Gesture.Pan>;
  /** Normalized thumb position, 0..1. */
  position: SharedValue<number>;
  /** Stop the drag currently snaps to; prevents duplicate commits. */
  activeStopIndex: SharedValue<number>;
  isPressed: SharedValue<boolean>;
  /** Measured track width in dp; write from onLayout. */
  trackWidth: SharedValue<number>;
};

/**
 * Pan gesture with tap-to-seek, drag magnetism toward stops, commit on successful
 * release, and an ease-out snap to the nearest stop on release.
 */
export function useEffortSliderGesture({
  stopCount,
  initialIndex,
  disabled,
  reducedMotion,
  thumbCenterInset,
  onCommit,
}: EffortSliderGestureConfig): EffortSliderGesture {
  const position = useSharedValue(stopFraction(initialIndex, stopCount));
  const activeStopIndex = useSharedValue(initialIndex);
  const isPressed = useSharedValue(false);
  const startIndex = useSharedValue(initialIndex);
  const trackWidth = useSharedValue(0);

  const gesture = useMemo(() => {
    const seek = (x: number) => {
      'worklet';
      const width = Math.max(trackWidth.value, 1);
      const raw = trackXToFraction(x, width, thumbCenterInset);
      const snapIndex = nearestStopIndex(raw, stopCount);
      position.value = magnetize(raw, stopCount, effortSliderMagnetRadius);
      if (snapIndex !== activeStopIndex.value) {
        activeStopIndex.value = snapIndex;
      }
    };

    return Gesture.Pan()
      .enabled(!disabled)
      .minDistance(0)
      .onBegin((event) => {
        'worklet';
        startIndex.value = activeStopIndex.value;
        isPressed.value = true;
        seek(event.x);
      })
      .onUpdate((event) => {
        'worklet';
        seek(event.x);
      })
      .onFinalize((_event, success) => {
        'worklet';
        isPressed.value = false;
        const target = success ? nearestStopIndex(position.value, stopCount) : startIndex.value;
        const targetFraction = stopFraction(target, stopCount);
        if (reducedMotion) {
          position.value = targetFraction;
        } else {
          position.value = withTiming(targetFraction, effortSliderSnapTiming);
        }
        activeStopIndex.value = target;
        if (success && target !== startIndex.value) runOnJS(onCommit)(target);
      });
  }, [
    activeStopIndex,
    disabled,
    isPressed,
    onCommit,
    position,
    reducedMotion,
    stopCount,
    startIndex,
    thumbCenterInset,
    trackWidth,
  ]);

  return { gesture, position, activeStopIndex, isPressed, trackWidth };
}
