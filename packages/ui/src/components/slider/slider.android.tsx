import { Slider as HeroSlider } from 'heroui-native';
import { Text, View } from 'react-native';

import type { SliderProps } from './slider.types';

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
    <HeroSlider
      accessibilityLabel={accessibilityLabel}
      className={hasValueLabels ? 'min-w-0 flex-1' : undefined}
      isDisabled={disabled}
      maxValue={max}
      minValue={min}
      onChange={(nextValue) => onValueChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)}
      step={step}
      style={hasValueLabels ? undefined : style}
      testID={testID}
      value={value}
    >
      <HeroSlider.Track>
        <HeroSlider.Fill />
        <HeroSlider.Thumb />
      </HeroSlider.Track>
    </HeroSlider>
  );

  if (!hasValueLabels) {
    return slider;
  }

  return (
    <View className="flex-row items-center gap-3" style={style}>
      {minimumValueLabel ? (
        <Text className="text-sm text-foreground">{minimumValueLabel}</Text>
      ) : null}
      {slider}
      {maximumValueLabel ? (
        <Text className="text-sm text-foreground">{maximumValueLabel}</Text>
      ) : null}
    </View>
  );
}
