import { cn } from 'heroui-native/utils';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps } from 'react-native';

type SettingsIconButtonProps = Pick<PressableProps, 'accessibilityLabel' | 'onPress'> & {
  children: ReactNode;
  className?: string;
  isDisabled?: boolean;
};

export function SettingsIconButton({
  accessibilityLabel,
  children,
  className,
  isDisabled = false,
  onPress,
}: SettingsIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      className={cn(
        'size-10 items-center justify-center rounded-xl bg-settings-grouped-surface active:opacity-60 disabled:opacity-40',
        className,
      )}
      disabled={isDisabled}
      hitSlop={6}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}
