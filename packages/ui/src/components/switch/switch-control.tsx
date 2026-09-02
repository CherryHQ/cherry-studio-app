import { Switch as HeroSwitch } from 'heroui-native';

import type { SwitchControlProps } from './switch-control.types';
import type { SwitchSize } from './switch.types';

const sizeStyles: Record<SwitchSize, { root: string; thumb: string }> = {
  default: { root: 'h-6 w-12', thumb: 'h-5 w-7' },
  lg: { root: 'h-7 w-14', thumb: 'h-6 w-8' },
  sm: { root: 'h-5 w-10', thumb: 'h-4 w-6' },
};

// Web and non-native tooling keep the Cherry control. Metro replaces this
// private adapter with the native iOS or Android implementation on device.
export function SwitchControl({
  accessibilityElementsHidden,
  accessibilityLabel,
  disabled = false,
  importantForAccessibility,
  onValueChange,
  pointerEvents,
  size = 'default',
  style,
  testID,
  value,
}: SwitchControlProps) {
  return (
    <HeroSwitch
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityLabel={accessibilityLabel}
      className={sizeStyles[size].root}
      hitSlop={8}
      importantForAccessibility={importantForAccessibility}
      isDisabled={disabled}
      isSelected={value}
      onSelectedChange={onValueChange}
      pointerEvents={pointerEvents}
      style={style}
      testID={testID}
    >
      <HeroSwitch.Thumb className={sizeStyles[size].thumb} />
    </HeroSwitch>
  );
}
