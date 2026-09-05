import { cn } from '@cherrystudio/ui/utils';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import type { HeaderActionTargetSize } from './HeaderAction.types';
import { HEADER_ICON_ACTION_CLASS_NAMES } from './headerActionStyles';

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onPress?: () => void;
  targetSize?: HeaderActionTargetSize;
  testID?: string;
};

export function HeaderIconButton({
  accessibilityLabel,
  children,
  className,
  disabled,
  onPress,
  targetSize = 'surface',
  testID,
}: HeaderIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        HEADER_ICON_ACTION_CLASS_NAMES[targetSize],
        'active:opacity-60',
        disabled && 'opacity-50',
        className,
      )}
      disabled={disabled}
      hitSlop={targetSize === 'surface' ? 8 : undefined}
      onPress={onPress}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}
