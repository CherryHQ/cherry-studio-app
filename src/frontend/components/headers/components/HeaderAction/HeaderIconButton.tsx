import { cn } from '@cherrystudio/ui/utils';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { HEADER_ICON_ACTION_CLASS_NAME } from './headerActionStyles';

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function HeaderIconButton({
  accessibilityLabel,
  children,
  className,
  disabled,
  onPress,
  testID,
}: HeaderIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        HEADER_ICON_ACTION_CLASS_NAME,
        'active:opacity-60',
        disabled && 'opacity-50',
        className,
      )}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}
