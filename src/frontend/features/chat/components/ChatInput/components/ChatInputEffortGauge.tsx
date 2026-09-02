import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { Canvas, Circle, Line, Path, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { effortGaugeNeedleAngle } from '../effortSlider/utils/effortSliderMath';
import type { ChatInputEffortFrame } from '../utils/chatInputEffortLayout';

const gaugeSize = 20;
const gaugeCenter = vec(gaugeSize / 2, 14);
const needleLength = 6.5;

type ChatInputEffortGaugeProps = {
  accessibilityLabel: string;
  onPress: (frame: ChatInputEffortFrame) => void;
  stopCount: number;
  valueIndex: number;
};

/** Compact effort indicator whose needle uses the slider's discrete stop map. */
export function ChatInputEffortGauge({
  accessibilityLabel,
  onPress,
  stopCount,
  valueIndex,
}: ChatInputEffortGaugeProps) {
  const [brandColor, foregroundColor] = useThemeColor(['brand', 'foreground']);
  const reducedMotion = useReducedMotion();
  const needleAngle = useSharedValue(effortGaugeNeedleAngle(valueIndex, stopCount));
  const footprintRef = useRef<View>(null);
  const needleEnd = useDerivedValue(() => ({
    x: gaugeCenter.x + Math.sin(needleAngle.value) * needleLength,
    y: gaugeCenter.y - Math.cos(needleAngle.value) * needleLength,
  }));

  useEffect(() => {
    const nextAngle = effortGaugeNeedleAngle(valueIndex, stopCount);
    needleAngle.set(
      reducedMotion
        ? nextAngle
        : withTiming(nextAngle, { duration: duration.base, easing: easing.settle }),
    );
  }, [needleAngle, reducedMotion, stopCount, valueIndex]);

  const handlePress = useCallback(() => {
    footprintRef.current?.measureInWindow((left, top, width, height) => {
      if (width > 0 && height > 0) {
        onPress({ height, left, top, width });
      }
    });
  }, [onPress]);

  return (
    <View ref={footprintRef} collapsable={false} style={gaugeFootprintStyle}>
      <Composer.Action
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        testID="chat-input-effort-gauge"
      >
        <Canvas pointerEvents="none" style={gaugeStyle}>
          <Path
            color={foregroundColor}
            end={0.98}
            path="M 3.5 14 A 6.5 7.5 0 0 1 16.5 14"
            start={0.02}
            strokeCap="round"
            strokeWidth={1.7}
            // Skia's paint style is a string enum; this is not React Native's style prop.
            // oxlint-disable-next-line react/style-prop-object
            style="stroke"
          />
          <Line
            color={brandColor}
            p1={gaugeCenter}
            p2={needleEnd}
            strokeCap="round"
            strokeWidth={1.8}
          />
          <Circle color={brandColor} cx={gaugeCenter.x} cy={gaugeCenter.y} r={1.4} />
        </Canvas>
      </Composer.Action>
    </View>
  );
}

const gaugeStyle = { height: gaugeSize, width: gaugeSize } as const;
const gaugeFootprintStyle = { height: 32, width: 32 } as const;
