import { Pressable, type GestureResponderEvent } from 'react-native';

import { useLocked } from '../locked/locked-context';
import { LockedTrigger } from '../locked/locked-trigger';
import { SwitchIndicator } from './switch-indicator';
import type { SwitchProps } from './switch.types';

export function Switch({
  accessibilityLabel,
  disabled = false,
  locked,
  onValueChange,
  size = 'default',
  style,
  testID,
  value,
}: SwitchProps) {
  const isLocked = useLocked(locked);
  if (isLocked) {
    return (
      <LockedTrigger accessibilityLabel={accessibilityLabel} testID={testID}>
        <SwitchIndicator locked testID={testID ? `${testID}-indicator` : undefined} value={value} />
      </LockedTrigger>
    );
  }

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
      hitSlop={14}
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
