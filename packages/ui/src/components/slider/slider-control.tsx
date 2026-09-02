import { Slider as HeroSlider } from 'heroui-native';
import type { AccessibilityActionEvent } from 'react-native';

import type { SliderControlProps } from './slider-control.types';

const ACCESSIBILITY_ACTIONS = [{ name: 'decrement' }, { name: 'increment' }] as const;

// Web and non-native tooling keep the Cherry control. Metro replaces this
// private adapter with the native iOS or Android implementation on device.
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

  return (
    <HeroSlider
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
        <HeroSlider.Thumb
          accessibilityActions={disabled ? undefined : ACCESSIBILITY_ACTIONS}
          accessibilityLabel={accessibilityLabel}
          onAccessibilityAction={disabled ? undefined : handleAccessibilityAction}
        />
      </HeroSlider.Track>
    </HeroSlider>
  );
}
