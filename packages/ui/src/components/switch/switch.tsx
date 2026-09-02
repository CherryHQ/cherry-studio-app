import { Pressable, type GestureResponderEvent } from 'react-native';

import { SwitchControl } from './switch-control';
import type { SwitchProps } from './switch.types';

function stopPressPropagation(event: GestureResponderEvent) {
  event.stopPropagation();
}

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
    <Pressable accessible={false} hitSlop={8} onPress={stopPressPropagation}>
      <SwitchControl
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onValueChange={onValueChange}
        size={size}
        style={style}
        testID={testID}
        value={value}
      />
    </Pressable>
  );
}
