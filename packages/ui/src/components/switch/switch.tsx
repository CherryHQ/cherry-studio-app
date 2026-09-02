import { SwitchControl } from './switch-control';
import type { SwitchProps } from './switch.types';

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
    <SwitchControl
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onValueChange={onValueChange}
      size={size}
      style={style}
      testID={testID}
      value={value}
    />
  );
}
