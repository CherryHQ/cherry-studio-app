import { Text, View } from 'react-native';

import { SliderControl } from './slider-control';
import type { SliderProps } from './slider.types';

const flexibleControlStyle = { flex: 1, minWidth: 0 } as const;

export function Slider({
  accessibilityLabel,
  disabled = false,
  max = 100,
  maximumValueLabel,
  min = 0,
  minimumValueLabel,
  onValueChange,
  step = 1,
  style,
  testID,
  value,
}: SliderProps) {
  const hasValueLabels = Boolean(minimumValueLabel || maximumValueLabel);
  const slider = (
    <SliderControl
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      max={max}
      min={min}
      onValueChange={onValueChange}
      step={step}
      style={hasValueLabels ? flexibleControlStyle : style}
      testID={testID}
      value={value}
    />
  );

  if (!hasValueLabels) {
    return slider;
  }

  return (
    <View className="flex-row items-center gap-3" style={style}>
      {minimumValueLabel ? (
        <Text className="text-foreground text-sm">{minimumValueLabel}</Text>
      ) : null}
      {slider}
      {maximumValueLabel ? (
        <Text className="text-foreground text-sm">{maximumValueLabel}</Text>
      ) : null}
    </View>
  );
}
