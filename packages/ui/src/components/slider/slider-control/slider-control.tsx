import { Slider as HeroSlider } from 'heroui-native';
import type { AccessibilityActionEvent } from 'react-native';

import type { SliderControlProps } from './slider-control.types';

const ACCESSIBILITY_ACTIONS = [{ name: 'decrement' }, { name: 'increment' }] as const;

// Android and Web share the styled control; iOS keeps its private native adapter.
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
      className="min-h-12 justify-center"
      isDisabled={disabled}
      maxValue={max}
      minValue={min}
      onChange={(nextValue) => onValueChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)}
      step={step}
      style={style}
      testID={testID}
      value={value}
    >
      <HeroSlider.Track className="h-1.5 rounded-full bg-primary/10" hitSlop={21}>
        <HeroSlider.Fill className="rounded-full bg-primary" />
        <HeroSlider.Thumb
          accessibilityActions={disabled ? undefined : ACCESSIBILITY_ACTIONS}
          accessibilityLabel={accessibilityLabel}
          classNames={{
            thumbContainer: 'size-6 rounded-full bg-background p-0.5',
            thumbKnob: 'rounded-full bg-primary shadow-none',
          }}
          onAccessibilityAction={disabled ? undefined : handleAccessibilityAction}
        />
      </HeroSlider.Track>
    </HeroSlider>
  );
}
