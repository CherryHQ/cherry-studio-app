import { Switch as NativeSwitch } from 'react-native';

import type { SwitchControlProps } from './switch-control.types';
import type { SwitchSize } from './switch.types';

const sizeStyles: Record<Exclude<SwitchSize, 'default'>, { transform: [{ scale: number }] }> = {
  lg: { transform: [{ scale: 1.15 }] },
  sm: { transform: [{ scale: 0.8 }] },
};

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
    <NativeSwitch
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      importantForAccessibility={importantForAccessibility}
      onValueChange={onValueChange}
      pointerEvents={pointerEvents}
      style={size === 'default' ? style : [sizeStyles[size], style]}
      testID={testID}
      value={value}
    />
  );
}
