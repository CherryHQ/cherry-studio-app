import { type ReactElement, useRef } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

import { MenuContent } from '../menu-content';
import type { ActionMenuProps } from '../menu.types';
import { useMenuState } from '../use-menu-state';

/** Tap menus share the add menu's panel while keeping their own trigger artwork. */
export function ActionMenu({ children, items }: ActionMenuProps) {
  if (items.length === 0) {
    return children;
  }

  return <ActionMenuTrigger items={items}>{children}</ActionMenuTrigger>;
}

function ActionMenuTrigger({ children, items }: ActionMenuProps) {
  const triggerRef = useRef<View>(null);
  const { anchor, close, finishClose, isOpen, open } = useMenuState(triggerRef);
  const child = children as ReactElement<ViewProps & { disabled?: boolean }>;
  const isDisabled = Boolean(
    child.props.disabled ||
    child.props.accessibilityState?.disabled ||
    child.props.pointerEvents === 'none',
  );

  return (
    <>
      <Pressable
        accessibilityLabel={child.props.accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{
          ...child.props.accessibilityState,
          disabled: isDisabled,
          expanded: isOpen,
        }}
        className="active:opacity-60"
        collapsable={false}
        disabled={isDisabled}
        onStartShouldSetResponderCapture={
          isDisabled ? undefined : child.props.onStartShouldSetResponderCapture
        }
        onPress={() => {
          if (isDisabled) {
            return;
          }
          triggerRef.current?.measureInWindow((pageX, pageY, width, height) => {
            open({ height, pageX, pageY, width });
          });
        }}
        ref={triggerRef}
      >
        <View
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {children}
        </View>
      </Pressable>
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
