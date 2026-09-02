import NativeSlider from '@react-native-community/slider';

import type { SliderControlProps } from './slider-control.types';

export function SliderControl({
  accessibilityLabel,
  disabled = false,
  max = 100,
  min = 0,
  onValueChange,
  step = 1,
  style,
  testID,
  value,
}: SliderControlProps) {
  return (
    <NativeSlider
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{ max, min, now: value }}
      disabled={disabled}
      maximumValue={max}
      minimumValue={min}
      onValueChange={onValueChange}
      step={step}
      style={style}
      testID={testID}
      value={value}
    />
  );
}
