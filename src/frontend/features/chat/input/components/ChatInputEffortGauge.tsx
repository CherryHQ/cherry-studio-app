import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { Canvas, Circle, Line, Path, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { effortGaugeNeedleAngle } from '../effortSlider/utils/effortSliderMath';

const gaugeSize = 20;
const gaugeCenter = vec(gaugeSize / 2, 13);
const needleLength = 6;

type ChatInputEffortGaugeProps = {
  accessibilityLabel: string;
  onPress: () => void;
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
  const [foregroundColor, brandColor] = useThemeColor(['foreground', 'brand']);
  const reducedMotion = useReducedMotion();
  const needleAngle = useSharedValue(effortGaugeNeedleAngle(valueIndex, stopCount));
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

  return (
    <Composer.Action
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID="chat-input-effort-gauge"
    >
      <Canvas pointerEvents="none" style={gaugeStyle}>
        <Path
          color={foregroundColor}
          end={0.98}
          path="M 3.5 13 A 6.5 6.5 0 0 1 16.5 13"
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
  );
}

const gaugeStyle = { height: gaugeSize, width: gaugeSize } as const;
