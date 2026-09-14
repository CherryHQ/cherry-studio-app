import { cloneElement, type ReactElement, useCallback, useMemo, useRef, useState } from 'react';
import { type AccessibilityActionEvent, type AccessibilityActionInfo, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { MenuContent } from '../menu-content';
import type { ContextMenuProps, MenuItem } from '../menu.types';
import { useMenuState } from '../use-menu-state';
import { ContextMenuExclusionContext, useContextMenuTouch } from './context-menu-exclusion';
import { useContextMenuInteraction } from './context-menu-scroll-boundary';

type AccessibilityInjectedProps = {
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

type GestureContextMenuProps = Pick<ContextMenuProps, 'children' | 'items'> & {
  /** Null until the platform configuration is available. */
  configuration: { maxDistance?: number; minDuration: number } | null;
};

/** Shared recognition and presentation for Android and explicitly timed iOS menus. */
export function GestureContextMenu({ children, configuration, items }: GestureContextMenuProps) {
  const anchorRef = useRef<View>(null);
  const [anchorView, setAnchorView] = useState<View | null>(null);
  const handleAnchor = useCallback((view: View | null) => {
    anchorRef.current = view;
    setAnchorView(view);
  }, []);
  const { anchor, close, finishClose, isOpen, open } = useMenuState(anchorRef);
  const interaction = useContextMenuInteraction();
  const touch = useContextMenuTouch();
  const touchInteraction = touch.interaction;
  const handleLongPress = useCallback(() => {
    const generation = touchInteraction.getGeneration();
    if (!interaction.isRecognitionBlocked() && !touchInteraction.isRecognitionBlocked()) {
      anchorView?.measureInWindow((pageX, pageY, width, height) => {
        if (
          generation === touchInteraction.getGeneration() &&
          !interaction.isRecognitionBlocked() &&
          !touchInteraction.isRecognitionBlocked()
        ) {
          open({ height, pageX, pageY, width });
        }
      });
    }
  }, [anchorView, interaction, open, touchInteraction]);
  const minDuration = configuration?.minDuration;
  const maxDistance = configuration?.maxDistance;
  const isEnabled =
    minDuration !== undefined && !touch.isTouchExcluded && items.some((item) => !item.disabled);
  const longPress = useMemo(() => {
    const gesture = Gesture.LongPress().enabled(isEnabled).runOnJS(true);
    if (minDuration !== undefined) {
      gesture.minDuration(minDuration).onStart(handleLongPress);
      if (maxDistance !== undefined) gesture.maxDistance(maxDistance);
    }
    return gesture;
  }, [handleLongPress, isEnabled, maxDistance, minDuration]);

  return (
    <>
      <ContextMenuExclusionContext value={touch.excludeTouch}>
        <GestureDetector gesture={longPress}>
          <View
            collapsable={false}
            onTouchCancel={touch.onTouchCancel}
            onTouchEnd={touch.onTouchFinish}
            onTouchStart={touch.onTouchStart}
            ref={handleAnchor}
          >
            {withMenuAccessibilityActions(children, items)}
          </View>
        </GestureDetector>
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
