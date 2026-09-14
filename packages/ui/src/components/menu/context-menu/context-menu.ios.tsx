import { callback } from 'react-native-nitro-modules';

import type { ContextMenuProps } from '../menu.types';
import { NativeCherryMenuView, useNativeMenu } from '../use-native-menu';
import { GestureContextMenu } from './context-menu-gesture';

/**
 * Default iOS long-press recognition stays system-owned: the native view attaches a
 * UIContextMenuInteraction and UIKit arbitrates it against scroll ancestors,
 * cancellation, and accessibility.
 */
export function ContextMenu({ children, delayLongPress, items }: ContextMenuProps) {
  const { nativeItems, onAction } = useNativeMenu(items);

  // UIContextMenuInteraction does not expose a configurable recognition duration.
  // Explicit timing uses the existing Cherry menu and native gesture recognizer.
  if (delayLongPress !== undefined) {
    return (
      <GestureContextMenu configuration={{ minDuration: delayLongPress }} items={items}>
        {children}
      </GestureContextMenu>
    );
  }

  if (items.length === 0) {
    return children;
  }

  return (
    <NativeCherryMenuView items={nativeItems} onAction={callback(onAction)} trigger="longPress">
      {children}
    </NativeCherryMenuView>
  );
}
