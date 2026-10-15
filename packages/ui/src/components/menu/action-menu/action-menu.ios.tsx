import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import { callback } from 'react-native-nitro-modules';

import type { ActionMenuProps } from '../menu.types';
import { NativeCherryMenuView, useNativeMenu } from '../use-native-menu';

/**
 * Tap-triggered dropdown of actions. The tap is button behavior the menu owns
 * outright, so recognition and presentation both stay in the native view.
 */
export function ActionMenu({ children, items }: ActionMenuProps) {
  const { nativeItems, onAction } = useNativeMenu(items);
  const child = children as ReactElement<ViewProps & { disabled?: boolean }>;
  const isDisabled = Boolean(
    child.props.disabled ||
    child.props.accessibilityState?.disabled ||
    child.props.pointerEvents === 'none',
  );

  if (items.length === 0 || isDisabled) {
    return children;
  }

  return (
    <NativeCherryMenuView items={nativeItems} onAction={callback(onAction)} trigger="tap">
      {children}
    </NativeCherryMenuView>
  );
}
