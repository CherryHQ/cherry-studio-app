import { View } from 'react-native';
import { callback } from 'react-native-nitro-modules';

import type { ContextMenuProps } from '../menu.types';
import { NativeCherryMenuView, useNativeMenu } from '../use-native-menu';
import { ContextMenuExclusionContext, useContextMenuTouch } from './context-menu-exclusion';

const EMPTY_NATIVE_ITEMS: [] = [];

/**
 * iOS long-press recognition stays system-owned: the native view attaches a
 * UIContextMenuInteraction and UIKit arbitrates it against scroll ancestors,
 * cancellation, and accessibility.
 */
export function ContextMenu({ children, items }: ContextMenuProps) {
  const { nativeItems, onAction } = useNativeMenu(items);
  const touch = useContextMenuTouch();

  return (
    <ContextMenuExclusionContext value={touch.excludeTouch}>
      {/* Keep exclusion until a fresh touch. UIKit can cancel RN touches while
          requesting its menu; clearing on cancellation would re-enable that menu. */}
      <View collapsable={false} onTouchStart={touch.onTouchStart}>
        <NativeCherryMenuView
          items={touch.isTouchExcluded ? EMPTY_NATIVE_ITEMS : nativeItems}
          onAction={callback(onAction)}
          trigger="longPress"
        >
          {children}
        </NativeCherryMenuView>
      </View>
    </ContextMenuExclusionContext>
  );
}
