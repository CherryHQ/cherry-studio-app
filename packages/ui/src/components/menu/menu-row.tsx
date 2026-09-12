import { type ReactNode, useCallback } from 'react';
import {
  type AccessibilityRole,
  type AccessibilityState,
  Pressable,
  Text,
  View,
} from 'react-native';

import { cn } from '../../utils';
import { useMenuInteraction } from './menu-interaction';

/** Every action and toggle has one press target, one accessible node, and wrapping text. */
export function MenuRow({
  accessibilityRole = 'menuitem',
  accessibilityState,
  destructive = false,
  disabled = false,
  icon,
  label,
  onPress,
  testID,
  trailing,
}: {
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  destructive?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  testID?: string;
  trailing?: ReactNode;
}) {
  const { close, isOpen, registerItem } = useMenuInteraction();
  const register = useCallback(
    (item: View | null) => (item ? registerItem?.(item) : undefined),
    [registerItem],
  );

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled }}
      className="min-h-11 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active disabled:opacity-40"
      disabled={disabled}
      onPress={() => {
        if (isOpen && !disabled) {
          close(onPress);
        }
      }}
      ref={register}
      testID={testID}
    >
      {icon ? <MenuRowDecoration>{icon}</MenuRowDecoration> : null}
      <Text
        className={cn(
          'min-w-0 flex-1 text-base',
          destructive ? 'text-destructive' : 'text-foreground',
        )}
      >
        {label}
      </Text>
      {trailing ? <MenuRowDecoration>{trailing}</MenuRowDecoration> : null}
    </Pressable>
  );
}

function MenuRowDecoration({ children }: { children: ReactNode }) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {children}
    </View>
  );
}
