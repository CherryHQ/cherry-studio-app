import { callback } from 'react-native-nitro-modules';

import type { ContextMenuProps } from '../menu.types';
import { NativeCherryMenuView, useNativeMenu } from '../use-native-menu';

/**
 * iOS long-press recognition stays system-owned: the native view attaches a
 * UIContextMenuInteraction and UIKit arbitrates it against scroll ancestors,
 * cancellation, and accessibility.
 */
export function ContextMenu({ children, items }: ContextMenuProps) {
  const { nativeItems, onAction } = useNativeMenu(items);

  if (items.length === 0) {
    return children;
  }

  return (
    <NativeCherryMenuView items={nativeItems} onAction={callback(onAction)} trigger="longPress">
      {children}
    </NativeCherryMenuView>
  );
}
