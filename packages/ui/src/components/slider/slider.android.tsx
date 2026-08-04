import { Slider as HeroSlider } from 'heroui-native';

import type { SliderProps } from './slider.types';

export function Slider({
  accessibilityLabel,
  disabled = false,
  max = 100,
  min = 0,
  onValueChange,
  step = 1,
  style,
  testID,
  value,
}: SliderProps) {
  return (
    <HeroSlider
      accessibilityLabel={accessibilityLabel}
      isDisabled={disabled}
      maxValue={max}
      minValue={min}
      onChange={(nextValue) => onValueChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)}
      step={step}
      style={style}
      testID={testID}
      value={value}
    >
      <HeroSlider.Track>
        <HeroSlider.Fill />
        <HeroSlider.Thumb />
      </HeroSlider.Track>
    </HeroSlider>
  );
}
