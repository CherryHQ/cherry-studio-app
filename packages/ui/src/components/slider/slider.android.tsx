import { Slider as HeroSlider } from 'heroui-native';
import { type AccessibilityActionEvent, Text, View } from 'react-native';

import type { SliderProps } from './slider.types';

const ACCESSIBILITY_ACTIONS = [{ name: 'decrement' }, { name: 'increment' }] as const;

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
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) {
      return;
    }

    const { actionName } = event.nativeEvent;
    if (actionName !== 'decrement' && actionName !== 'increment') {
      return;
    }

    const direction = actionName === 'increment' ? 1 : -1;
    const nextValue = Math.min(
      max,
      Math.max(min, Number((value + direction * step).toPrecision(12))),
    );
    if (nextValue !== value) {
      onValueChange(nextValue);
    }
  };
  const slider = (
    <HeroSlider
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
        <HeroSlider.Thumb
          accessibilityActions={disabled ? undefined : ACCESSIBILITY_ACTIONS}
          accessibilityLabel={accessibilityLabel}
          onAccessibilityAction={disabled ? undefined : handleAccessibilityAction}
        />
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
