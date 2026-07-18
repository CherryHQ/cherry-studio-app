import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  useColorScheme,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion, withTiming } from 'react-native-reanimated';

import { useEffortSliderGesture } from '../hooks/useEffortSliderGesture';
import { useShaderClock } from '../hooks/useShaderClock';
import { useThinkingReveal } from '../hooks/useThinkingReveal';
import { effortSliderSnapTiming } from '../utils/constants';
import { stopFraction } from '../utils/effortSliderMath';
import {
  darkThinkingFallbackGradient,
  darkThinkingPalette,
  effortTickColor,
  lightThinkingFallbackGradient,
  lightThinkingPalette,
  thinkingAccentColor,
} from '../utils/thinkingPalette';
import { EffortSliderTrack, effortSliderTrackRadius } from './EffortSliderTrack';
import { ThinkingPixelField } from './ThinkingPixelField';

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
  /**
   * Option whose stop ignites the thinking pixel field. Defaults to the last
   * option; pass e.g. 'max' when a trailing 'auto' stop shouldn't ignite.
   */
  pixelFieldValue?: string;
  /** Track height in dp. */
  trackHeight?: number;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Discrete effort slider with ease-out snapping, drag magnetism, and a Skia
 * "thinking" pixel field that ignites on the configured top stop. See
 * README.md for the source effect this ports.
 */
export function EffortSlider({
  options,
  value,
  onChange,
  disabled = false,
  pixelFieldValue,
  trackHeight = 32,
  accessibilityLabel,
  testID,
}: EffortSliderProps) {
  const reducedMotion = useReducedMotion();
  const isDark = useColorScheme() === 'dark';
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const stopCount = options.length;
  const valueIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const pixelStopIndex =
    pixelFieldValue === undefined
      ? stopCount - 1
      : options.findIndex((option) => option.value === pixelFieldValue);

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
    onCommit: handleCommit,
  });

  const { fieldMounted, reveal, fieldAlpha } = useThinkingReveal(
    activeStopIndex,
    pixelStopIndex,
    !reducedMotion,
  );
  const time = useShaderClock(fieldMounted);
  const palette = isDark ? darkThinkingPalette : lightThinkingPalette;
  const fallbackGradient = isDark ? darkThinkingFallbackGradient : lightThinkingFallbackGradient;
  const showStaticField = reducedMotion && valueIndex === pixelStopIndex && pixelStopIndex >= 0;

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
        testID={testID}
      >
        <EffortSliderTrack
          accentColor={thinkingAccentColor[isDark ? 'dark' : 'light']}
          hideTicks={fieldMounted || showStaticField}
          measuredWidth={measuredWidth}
          pixelStopIndex={pixelStopIndex}
          position={position}
          stopCount={stopCount}
          tickColor={effortTickColor[isDark ? 'dark' : 'light']}
          trackHeight={trackHeight}
        >
          {fieldMounted && !reducedMotion ? (
            <ThinkingPixelField
              fieldAlpha={fieldAlpha}
              height={trackHeight}
              palette={palette}
              radius={effortSliderTrackRadius}
              reveal={reveal}
              time={time}
              width={measuredWidth}
            />
          ) : null}
          {showStaticField ? (
            <LinearGradient
              colors={fallbackGradient}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            />
          ) : null}
        </EffortSliderTrack>
      </View>
    </GestureDetector>
  );
}
