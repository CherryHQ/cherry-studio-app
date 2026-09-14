import { useCallback, useMemo, useState } from 'react';
import { callback } from 'react-native-nitro-modules';

import type { ContextMenuProps } from '../menu.types';
import { type NativeCherryMenuRef, NativeCherryMenuView } from '../use-native-menu';
import { GestureContextMenu } from './context-menu-gesture';

type NativeMenuBinding = {
  maxDistance: number;
  minDuration: number;
  view: NativeCherryMenuRef;
};

const EMPTY_NATIVE_ITEMS: [] = [];
const IGNORE_NATIVE_ACTION = callback(() => {});

/**
 * Android long-press recognition lives in the shared gesture arena: the
 * gesture-handler long press loses to committed scrolling, drawer pans, and
 * sibling recognizers, and only a committed long press opens the Cherry menu.
 * The native view supplies Android ViewConfiguration only: it has no items
 * and never presents a system popup. The child receives enabled items as
 * accessibility custom actions so the operations do not depend on long press.
 */
export function ContextMenu({ children, delayLongPress, items }: ContextMenuProps) {
  if (items.length === 0 && delayLongPress === undefined) {
    return children;
  }

  return (
    <ContextMenuAnchor delayLongPress={delayLongPress} items={items}>
      {children}
    </ContextMenuAnchor>
  );
}

function ContextMenuAnchor({ children, delayLongPress, items }: ContextMenuProps) {
  const [menuBinding, setMenuBinding] = useState<NativeMenuBinding | null>(null);
  const handleMenuView = useCallback((view: NativeCherryMenuRef) => {
    const nextBinding = {
      maxDistance: view.getLongPressMaxDistance(),
      minDuration: view.getLongPressMinDuration(),
      view,
    };
    setMenuBinding((current) => (current?.view === view ? current : nextBinding));
  }, []);
  const hybridRef = useMemo(() => callback(handleMenuView), [handleMenuView]);

  return (
    <NativeCherryMenuView
      hybridRef={hybridRef}
      items={EMPTY_NATIVE_ITEMS}
      onAction={IGNORE_NATIVE_ACTION}
      trigger="longPress"
    >
      <GestureContextMenu
        configuration={
          menuBinding
            ? {
                maxDistance: menuBinding.maxDistance,
                minDuration: delayLongPress ?? menuBinding.minDuration,
              }
            : null
        }
        items={items}
      >
        {children}
      </GestureContextMenu>
    </NativeCherryMenuView>
  );
}
