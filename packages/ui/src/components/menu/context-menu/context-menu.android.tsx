import { cloneElement, type ReactElement, useMemo, useState } from 'react';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { callback } from 'react-native-nitro-modules';

import type { ContextMenuProps, MenuItem } from '../menu.types';
import { type NativeCherryMenuRef, NativeCherryMenuView, useNativeMenu } from '../use-native-menu';

type AccessibilityInjectedProps = {
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

/**
 * Android long-press recognition lives in the shared gesture arena: the
 * gesture-handler long press loses to committed scrolling, drawer pans, and
 * sibling recognizers, and only a committed long press presents the native
 * PopupMenu through showMenu(). Recognition timing and touch slop stay on the
 * recognizer's platform defaults. The child also receives the enabled items as
 * accessibility custom actions so the operations do not depend on long press.
 */
export function ContextMenu({ children, items }: ContextMenuProps) {
  const { nativeItems, onAction } = useNativeMenu(items);
  // The hybrid view arrives once on mount; holding it as state keeps the
  // gesture wiring out of render-time ref access.
  const [menuView, setMenuView] = useState<NativeCherryMenuRef | null>(null);
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .runOnJS(true)
        .onStart(() => menuView?.showMenu()),
    [menuView],
  );

  if (items.length === 0) {
    return children;
  }

  return (
    <GestureDetector gesture={longPress}>
      <NativeCherryMenuView
        hybridRef={callback(setMenuView)}
        items={nativeItems}
        onAction={callback(onAction)}
        trigger="longPress"
      >
        {withMenuAccessibilityActions(children, items)}
      </NativeCherryMenuView>
    </GestureDetector>
  );
}

function withMenuAccessibilityActions(
  children: ReactElement,
  items: readonly MenuItem[],
): ReactElement {
  const actionableItems = items.filter((item) => !item.disabled);
  if (actionableItems.length === 0) {
    return children;
  }

  const child = children as ReactElement<AccessibilityInjectedProps>;
  const { accessibilityActions = [], onAccessibilityAction } = child.props;

  return cloneElement(child, {
    accessibilityActions: [
      ...accessibilityActions,
      ...actionableItems.map((item) => ({ label: item.label, name: item.id })),
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      onAccessibilityAction?.(event);
      actionableItems.find((item) => item.id === event.nativeEvent.actionName)?.onPress();
    },
  });
}
