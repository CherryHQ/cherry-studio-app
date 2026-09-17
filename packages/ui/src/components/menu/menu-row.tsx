import { type ReactNode, useCallback } from 'react';
import {
  type AccessibilityRole,
  type AccessibilityState,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';

import { cn } from '../../utils';
import { useMenuInteraction } from './menu-interaction';

const ROW_CLASS_NAME = 'min-h-14 flex-row items-center gap-3 rounded-2xl px-3 py-2';

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
  const { close, isOpen, registerItem, shouldUseNativePresses } = useMenuInteraction();
  const register = useCallback(
    (item: View | null) => (item ? registerItem?.(item) : undefined),
    [registerItem],
  );

  const pressableProps = {
    accessibilityLabel: label,
    accessibilityRole,
    accessibilityState: { ...accessibilityState, disabled },
    disabled,
    onPress: () => {
      if (isOpen && !disabled) {
        close(onPress);
      }
    },
    ref: register,
    testID,
  };
  const content = (
    <>
      {icon ? (
        <MenuRowDecoration>
          <View className="size-10 items-center justify-center rounded-full bg-secondary">
            {icon}
          </View>
        </MenuRowDecoration>
      ) : null}
      <Text
        className={cn(
          'min-w-0 flex-1 text-base',
          destructive ? 'text-destructive' : 'text-popover-foreground',
        )}
      >
        {label}
      </Text>
      {trailing ? <MenuRowDecoration>{trailing}</MenuRowDecoration> : null}
    </>
  );

  if (shouldUseNativePresses) {
    return (
      <GesturePressable {...pressableProps}>
        {({ pressed }) => (
          // Uniwind's interactive selectors belong to RN Pressable. Keep the
          // row's geometry and pressed/disabled styling on a native View here.
          <View
            className={cn(
              ROW_CLASS_NAME,
              pressed && 'bg-secondary-active',
              disabled && 'opacity-40',
            )}
          >
            {content}
          </View>
        )}
      </GesturePressable>
    );
  }

  return (
    <Pressable
      {...pressableProps}
      className={cn(ROW_CLASS_NAME, 'active:bg-secondary-active disabled:opacity-40')}
    >
      {content}
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
