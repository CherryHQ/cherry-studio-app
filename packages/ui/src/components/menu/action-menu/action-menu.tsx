import { Popover, usePopover } from 'heroui-native/popover';
import type { ReactElement } from 'react';
import { View, type PressableProps } from 'react-native';

import { MenuContent } from '../menu-content';
import type { ActionMenuProps } from '../menu.types';

/** Android and Web render product menus; iOS owns its native menu adapter. */
export function ActionMenu({ children, items }: ActionMenuProps) {
  if (items.length === 0) {
    return children;
  }

  return (
    <Popover>
      <ActionMenuTrigger>{children}</ActionMenuTrigger>
      <MenuContent items={items} />
    </Popover>
  );
}

function ActionMenuTrigger({ children }: Pick<ActionMenuProps, 'children'>) {
  const { isOpen } = usePopover();
  const child = children as ReactElement<PressableProps>;
  const { accessibilityLabel, accessibilityState, disabled, onStartShouldSetResponderCapture } =
    child.props;
  const isDisabled =
    disabled || accessibilityState?.disabled || child.props.pointerEvents === 'none';

  return (
    <Popover.Trigger
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, expanded: isOpen }}
      className="active:opacity-60"
      hitSlop={8}
      isDisabled={isDisabled}
      onStartShouldSetResponderCapture={onStartShouldSetResponderCapture}
    >
      <View
        accessibilityElementsHidden={Boolean(accessibilityLabel)}
        importantForAccessibility={accessibilityLabel ? 'no-hide-descendants' : 'auto'}
        pointerEvents="none"
      >
        {children}
      </View>
    </Popover.Trigger>
  );
}
