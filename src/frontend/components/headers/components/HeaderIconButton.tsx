import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
};

export function HeaderIconButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: HeaderIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-9 items-center justify-center active:opacity-60"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}
