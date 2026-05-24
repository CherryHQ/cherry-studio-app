import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { withUniwind } from 'uniwind';

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
};

const StyledPressable = withUniwind(Pressable);

export function HeaderIconButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: HeaderIconButtonProps) {
  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-9 items-center justify-center active:opacity-60"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
    >
      {children}
    </StyledPressable>
  );
}
