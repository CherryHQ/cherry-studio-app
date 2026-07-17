import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

const trackPadding = 2;
const thumbWidth = 24;
// Every stop gets a round dot (the original's `.tick`, 0.25rem).
const tickSize = 4;

export const effortSliderTrackRadius = 10;

type EffortSliderTrackProps = PropsWithChildren<{
  trackHeight: number;
  stopCount: number;
  /** Normalized thumb position, 0..1. */
  position: SharedValue<number>;
  /** Measured track width in dp (React state, for tick layout). */
  measuredWidth: number;
  /** Stop index that ignites the pixel field; its dot gets the accent color. */
  pixelStopIndex: number;
  /** Accent color for the top (pixel-field) stop's dot. */
  accentColor: string;
  /** Color for every other stop's dot. */
  tickColor: string;
  /** Hide the dots while the pixel field owns the track (top stop). */
  hideTicks: boolean;
}>;

/**
 * Track visuals. Layering (bottom → top): base + progress fill + pixel-field
 * overlay (`children`) inside the clipped track, then the stop dots, then
 * the thumb. Dots sit above every track element but below the thumb, so the
 * only thing that can cover a dot is the thumb parked on it — the fill and
 * background never hide them. They're suppressed once the top stop's pixel
 * field is lit.
 */
export function EffortSliderTrack({
  trackHeight,
  stopCount,
  position,
  measuredWidth,
  pixelStopIndex,
  accentColor,
  tickColor,
  hideTicks,
  children,
}: EffortSliderTrackProps) {
  const thumbHeight = trackHeight - trackPadding * 2 - 2;
  // Precompute outside the worklets: measuredWidth is React state, not a shared
  // value, so calling a plain JS helper inside useAnimatedStyle would trip
  // Worklets' "synchronously called a Remote Function" guard.
  const travelDistance = Math.max(measuredWidth - thumbWidth - trackPadding * 2, 0);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackPadding + thumbWidth * 0.5 + travelDistance * position.value,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: trackPadding + travelDistance * position.value }],
  }));

  const tickCenters =
    measuredWidth > 0 && stopCount > 1
      ? Array.from({ length: stopCount }, (_, index) => {
          return trackPadding + thumbWidth * 0.5 + (travelDistance * index) / (stopCount - 1);
        })
      : [];

  return (
    <View className="w-full" style={{ height: trackHeight }}>
      <View
        className="absolute inset-0 overflow-hidden bg-surface-secondary"
        style={{ borderRadius: effortSliderTrackRadius }}
      >
        <Animated.View
          className="absolute top-0 bottom-0 left-0 bg-surface-tertiary"
          style={fillStyle}
        />
        {children}
      </View>
      {hideTicks
        ? null
        : tickCenters.map((centerX, index) => (
            <View
              key={centerX}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: (trackHeight - tickSize) / 2,
                left: centerX - tickSize / 2,
                width: tickSize,
                height: tickSize,
                borderRadius: tickSize / 2,
                backgroundColor: index === pixelStopIndex ? accentColor : tickColor,
              }}
            />
          ))}
      <Animated.View
        className="absolute border border-black/10 bg-white"
        style={[
          {
            top: trackPadding + 1,
            left: 0,
            width: thumbWidth,
            height: thumbHeight,
            borderRadius: 8,
            shadowColor: '#3e3832',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.15,
            shadowRadius: 2,
            elevation: 2,
          },
          thumbStyle,
        ]}
      />
    </View>
  );
}
