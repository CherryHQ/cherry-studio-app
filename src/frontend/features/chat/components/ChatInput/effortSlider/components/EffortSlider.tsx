import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { type AccessibilityActionEvent, type LayoutChangeEvent, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion, withTiming } from 'react-native-reanimated';

import { useEffortSliderGesture } from '../hooks/useEffortSliderGesture';
import { effortSliderSnapTiming } from '../utils/constants';
import { stopFraction } from '../utils/effortSliderMath';
import {
  effortSliderThumbInset,
  effortSliderThumbSize,
  effortSliderTrackHeight,
} from '../utils/effortSliderVisual';
import { EffortSliderTrack } from './EffortSliderTrack';

const unmeasuredStyle = { opacity: 0 } as const;

export type EffortSliderOption = {
  value: string;
  /** Already-translated label; the component itself has no i18n dependency. */
  label: string;
};

export type EffortSliderProps = {
  /** Ordered low → high; pass the model-dependent subset directly. */
  options: readonly EffortSliderOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Track height in dp. */
  trackHeight?: number;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Discrete effort slider with ease-out snapping, drag magnetism, and a
 * reference-matched two-layer track.
 */
export function EffortSlider({
  options,
  value,
  onChange,
  disabled = false,
  trackHeight = effortSliderTrackHeight,
  accessibilityLabel,
  testID,
}: EffortSliderProps) {
  const reducedMotion = useReducedMotion();
  // 0 until the first onLayout lands: with travelDistance 0 the thumb/fill
  // would paint at the left edge, then teleport once measured — hide the
  // track for those frames (the panel's fade-in covers the gap).
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const stopCount = options.length;
  const visualScale = trackHeight / effortSliderTrackHeight;
  const thumbCenterInset = (effortSliderThumbInset + effortSliderThumbSize / 2) * visualScale;
  const valueIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const handleCommit = useCallback(
    (index: number) => {
      // Fires on every stop the drag crosses (not only on final value change),
      // so a light selection tick lands on each detent — the tactile half of
      // the snapping. Fire-and-forget; unsupported devices just no-op.
      void Haptics.selectionAsync().catch(() => undefined);
      const option = options[index];
      if (option && option.value !== value) {
        onChange(option.value);
      }
    },
    [onChange, options, value],
  );

  const { gesture, position, activeStopIndex, isPressed, trackWidth } = useEffortSliderGesture({
    stopCount,
    initialIndex: valueIndex,
    disabled: disabled || stopCount < 2,
    reducedMotion,
    thumbCenterInset,
    onCommit: handleCommit,
  });

  // Sync external value changes (e.g. model switch fallback) onto the thumb.
  useEffect(() => {
    if (isPressed.get() || activeStopIndex.get() === valueIndex) {
      return;
    }
    activeStopIndex.set(valueIndex);
    const target = stopFraction(valueIndex, stopCount);
    position.set(reducedMotion ? target : withTiming(target, effortSliderSnapTiming));
  }, [activeStopIndex, isPressed, position, reducedMotion, stopCount, valueIndex]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      trackWidth.set(width);
      setMeasuredWidth((current) => (current === width ? current : width));
    },
    [trackWidth],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
      const next = options[valueIndex + delta];
      if (next) {
        onChange(next.value);
      }
    },
    [onChange, options, valueIndex],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled }}
        accessibilityValue={{ text: options[valueIndex]?.label ?? '' }}
        accessible
        className={disabled ? 'opacity-60' : undefined}
        onAccessibilityAction={handleAccessibilityAction}
        onLayout={handleLayout}
        style={measuredWidth === 0 ? unmeasuredStyle : undefined}
        testID={testID}
      >
        <EffortSliderTrack
          measuredWidth={measuredWidth}
          position={position}
          stopCount={stopCount}
          trackHeight={trackHeight}
        />
      </View>
    </GestureDetector>
  );
}
