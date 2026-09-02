import { SwitchVisual } from './switch-visual';
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
    <SwitchVisual
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
