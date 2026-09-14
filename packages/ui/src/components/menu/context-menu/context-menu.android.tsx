import { cloneElement, type ReactElement, useCallback, useMemo, useRef, useState } from 'react';
import { type AccessibilityActionEvent, type AccessibilityActionInfo, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type LongPressGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { callback } from 'react-native-nitro-modules';

import { MenuContent } from '../menu-content';
import type { ContextMenuProps, MenuItem } from '../menu.types';
import { useMenuState } from '../use-menu-state';
import { type NativeCherryMenuRef, NativeCherryMenuView } from '../use-native-menu';
import { ContextMenuExclusionContext, useContextMenuTouch } from './context-menu-exclusion';
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

const EMPTY_NATIVE_ITEMS: [] = [];
const IGNORE_NATIVE_ACTION = callback(() => {});

/**
 * Android long-press recognition lives in the shared gesture arena: the
 * gesture-handler long press loses to committed scrolling, drawer pans, and
 * sibling recognizers, and only a committed long press opens the Cherry menu
 * at the pointer's window coordinates.
 * The native view supplies Android ViewConfiguration only: it has no items
 * and never presents a system popup. The child receives enabled items as
 * accessibility custom actions so the operations do not depend on long press.
 */
export function ContextMenu({ children, items }: ContextMenuProps) {
  const anchorRef = useRef<View>(null);
  const { anchor, close, finishClose, isOpen, open } = useMenuState(anchorRef);
  const interaction = useContextMenuInteraction();
  const touch = useContextMenuTouch();
  const touchInteraction = touch.interaction;
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
  const handleLongPress = useCallback(
    ({ absoluteX, absoluteY }: LongPressGestureHandlerEventPayload) => {
      if (!interaction.isRecognitionBlocked() && !touchInteraction.isRecognitionBlocked()) {
        open({ height: 0, pageX: absoluteX, pageY: absoluteY, width: 0 });
      }
    },
    [interaction, open, touchInteraction],
  );
  const isEnabled =
    menuBinding !== null && !touch.isTouchExcluded && items.some((item) => !item.disabled);
  const longPress = useMemo(() => {
    const gesture = Gesture.LongPress().enabled(isEnabled).runOnJS(true);
    if (menuBinding) {
      gesture
        .minDuration(menuBinding.minDuration)
        .maxDistance(menuBinding.maxDistance)
        .onStart(handleLongPress);
    }
    return gesture;
  }, [handleLongPress, isEnabled, menuBinding]);

  return (
    <>
      <ContextMenuExclusionContext value={touch.excludeTouch}>
        <NativeCherryMenuView
          hybridRef={hybridRef}
          items={EMPTY_NATIVE_ITEMS}
          onAction={IGNORE_NATIVE_ACTION}
          trigger="longPress"
        >
          <GestureDetector gesture={longPress}>
            <View
              collapsable={false}
              onTouchCancel={touch.onTouchCancel}
              onTouchEnd={touch.onTouchFinish}
              onTouchStart={touch.onTouchStart}
              ref={anchorRef}
            >
              {withMenuAccessibilityActions(children, items)}
            </View>
          </GestureDetector>
        </NativeCherryMenuView>
      </ContextMenuExclusionContext>
      {anchor ? (
        <MenuContent
          anchor={anchor}
          isOpen={isOpen}
          items={items}
          onClose={close}
          onClosed={finishClose}
        />
      ) : null}
    </>
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
