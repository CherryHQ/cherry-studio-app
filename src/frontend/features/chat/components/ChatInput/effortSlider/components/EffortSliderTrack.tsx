import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getEffortSliderTrackGeometry, stopFraction } from '../utils/effortSliderMath';
import {
  effortSliderProgressHeight,
  effortSliderThumbInset,
  effortSliderThumbSize,
  effortSliderTickSize,
  effortSliderTrackHeight,
} from '../utils/effortSliderVisual';

type EffortSliderTrackProps = {
  trackHeight: number;
  stopCount: number;
  /** Normalized thumb position, 0..1. */
  position: SharedValue<number>;
  /** Measured track width in dp (React state, for tick layout). */
  measuredWidth: number;
};

/**
 * A 64dp opaque capsule surrounds a 44dp primary progress pill. The capsule and
 * exposed ticks follow the active theme. The thumb sits inside the progress end
 * cap, leaving its four-pixel primary ring visible at the endpoints.
 */
export function EffortSliderTrack({
  trackHeight,
  stopCount,
  position,
  measuredWidth,
}: EffortSliderTrackProps) {
  const [primaryColor, primaryForegroundColor, trackColor, trackForegroundColor, constantBlack] =
    useThemeColor([
      'primary',
      'primary-foreground',
      'popover',
      'popover-foreground',
      'constant-black',
    ]);
  const scale = trackHeight / effortSliderTrackHeight;
  const progressHeight = effortSliderProgressHeight * scale;
  const thumbInset = effortSliderThumbInset * scale;
  const thumbSize = effortSliderThumbSize * scale;
  const tickSize = effortSliderTickSize * scale;
  const { thumbCenterStart, tickCenters, travelDistance } = getEffortSliderTrackGeometry(
    measuredWidth,
    stopCount,
    thumbSize,
    thumbInset,
  );
  const progressInset = thumbCenterStart - progressHeight / 2;
  const stops = tickCenters.map((centerX, index) => ({
    centerX,
    fraction: stopFraction(index, stopCount),
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: progressHeight + travelDistance * position.value,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbInset + travelDistance * position.value }],
  }));

  return (
    <View className="w-full" style={{ height: trackHeight }}>
      <View className="absolute inset-0 rounded-full" style={{ backgroundColor: trackColor }}>
        {stops.map(({ centerX, fraction }) => (
          <View
            key={fraction}
            className="rounded-full"
            pointerEvents="none"
            style={{
              backgroundColor: trackForegroundColor,
              height: tickSize,
              left: centerX - tickSize / 2,
              opacity: 0.2,
              position: 'absolute',
              top: (trackHeight - tickSize) / 2,
              width: tickSize,
            }}
          />
        ))}
        <Animated.View
          className="absolute overflow-hidden rounded-full"
          style={[
            {
              backgroundColor: primaryColor,
              height: progressHeight,
              left: progressInset,
              top: (trackHeight - progressHeight) / 2,
            },
            fillStyle,
          ]}
        >
          <View
            pointerEvents="none"
            style={{ height: progressHeight, left: -progressInset, width: measuredWidth }}
          >
            {stops.map(({ centerX, fraction }) => (
              <View
                key={fraction}
                className="rounded-full"
                style={{
                  backgroundColor: primaryForegroundColor,
                  height: tickSize,
                  left: centerX - tickSize / 2,
                  opacity: 0.16,
                  position: 'absolute',
                  top: (progressHeight - tickSize) / 2,
                  width: tickSize,
                }}
              />
            ))}
          </View>
        </Animated.View>
      </View>
      <Animated.View
        className="absolute rounded-full"
        style={[
          {
            backgroundColor: primaryForegroundColor,
            elevation: 1,
            height: thumbSize,
            left: 0,
            shadowColor: constantBlack,
            shadowOffset: thumbShadowOffset,
            shadowOpacity: 0.22,
            shadowRadius: 1.5,
            top: (trackHeight - thumbSize) / 2,
            width: thumbSize,
          },
          thumbStyle,
        ]}
      />
    </View>
  );
}

const thumbShadowOffset = { height: 1, width: 0 } as const;
