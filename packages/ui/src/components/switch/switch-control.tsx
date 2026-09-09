import { Pressable, View } from 'react-native';

import { cn } from '../../utils';
import type { SwitchControlProps } from './switch-control.types';
import type { SwitchSize } from './switch.types';

const sizeStyles: Record<SwitchSize, { root: string; thumb: string }> = {
  default: { root: 'h-6 w-11', thumb: 'size-5' },
  lg: { root: 'h-7 w-12', thumb: 'size-6' },
  sm: { root: 'h-5 w-9', thumb: 'size-4' },
};

// Android and Web use Cherry-owned geometry and colors. The public switch or
// setting row owns the touch target; this control also supports standalone use.
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
    <Pressable
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      className={cn(
        'justify-center rounded-full p-0.5',
        sizeStyles[size].root,
        value ? 'items-end bg-primary' : 'items-start bg-border-selected',
        disabled && 'opacity-40',
      )}
      disabled={disabled}
      hitSlop={8}
      importantForAccessibility={importantForAccessibility}
      onPress={onValueChange ? () => onValueChange(!value) : undefined}
      pointerEvents={pointerEvents}
      style={style}
      testID={testID}
    >
      <View
        className={cn(
          'rounded-full',
          sizeStyles[size].thumb,
          value ? 'bg-primary-foreground' : 'bg-background',
        )}
      />
    </Pressable>
  );
}
