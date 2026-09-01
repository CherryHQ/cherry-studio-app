import { cloneElement, type ReactElement, useCallback, useMemo, useState } from 'react';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { callback } from 'react-native-nitro-modules';

import type { ContextMenuProps, MenuItem } from '../menu.types';
import { type NativeCherryMenuRef, NativeCherryMenuView, useNativeMenu } from '../use-native-menu';
import { useContextMenuInteraction } from './context-menu-scroll-boundary.android';

type AccessibilityInjectedProps = {
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

type NativeMenuBinding = {
  maxDistance: number;
  minDuration: number;
  view: NativeCherryMenuRef;
};

/**
 * Android long-press recognition lives in the shared gesture arena: the
 * gesture-handler long press loses to committed scrolling, drawer pans, and
 * sibling recognizers, and only a committed long press presents the native
 * PopupMenu through showMenu(). Recognition timing and touch slop come from
 * Android ViewConfiguration. The child also receives the enabled items as
 * accessibility custom actions so the operations do not depend on long press.
 */
export function ContextMenu({ children, items }: ContextMenuProps) {
  const { nativeItems, onAction } = useNativeMenu(items);
  const interaction = useContextMenuInteraction();
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
  const longPress = useMemo(() => {
    const gesture = Gesture.LongPress().runOnJS(true);
    if (menuBinding) {
      gesture
        .minDuration(menuBinding.minDuration)
        .maxDistance(menuBinding.maxDistance)
        .onStart(() => {
          if (!interaction.isRecognitionBlocked()) {
            menuBinding.view.showMenu();
          }
        });
    }

    return gesture;
  }, [interaction, menuBinding]);

  if (items.length === 0) {
    return children;
  }

  return (
    <GestureDetector gesture={longPress}>
      <NativeCherryMenuView
        hybridRef={hybridRef}
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
  const child = children as ReactElement<AccessibilityInjectedProps>;
  const { accessibilityActions = [], onAccessibilityAction } = child.props;
  const menuItemNames = new Set(items.map((item) => item.id));

  return cloneElement(child, {
    accessibilityActions: [
      ...accessibilityActions.filter((action) => !menuItemNames.has(action.name)),
      ...actionableItems.map((item) => ({ label: item.label, name: item.id })),
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      const menuItem = actionableItems.find((item) => item.id === event.nativeEvent.actionName);
      if (menuItem) {
        menuItem.onPress();
      } else if (!menuItemNames.has(event.nativeEvent.actionName)) {
        onAccessibilityAction?.(event);
      }
    },
  });
}
