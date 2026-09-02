import { Switch as HeroSwitch } from 'heroui-native';

import type { SwitchProps, SwitchSize } from './switch.types';

const sizeStyles: Record<SwitchSize, { root: string; thumb: string }> = {
  default: { root: 'h-6 w-12', thumb: 'h-5 w-7' },
  lg: { root: 'h-7 w-14', thumb: 'h-6 w-8' },
  sm: { root: 'h-5 w-10', thumb: 'h-4 w-6' },
};

export function Switch({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  size = 'default',
  style,
  testID,
  value,
}: SwitchProps) {
  return (
    <HeroSwitch
      accessibilityLabel={accessibilityLabel}
      className={sizeStyles[size].root}
      hitSlop={8}
      isDisabled={disabled}
      isSelected={value}
      onSelectedChange={onValueChange}
      style={style}
      testID={testID}
    >
      <HeroSwitch.Thumb className={sizeStyles[size].thumb} />
    </HeroSwitch>
  );
}
