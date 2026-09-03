import { Pressable, type GestureResponderEvent } from 'react-native';

import { SwitchIndicator } from './switch-indicator';
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
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onValueChange(!value);
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={handlePress}
      testID={testID}
    >
      <SwitchIndicator
        disabled={disabled}
        size={size}
        style={style}
        testID={testID ? `${testID}-indicator` : undefined}
        value={value}
      />
    </Pressable>
  );
}
