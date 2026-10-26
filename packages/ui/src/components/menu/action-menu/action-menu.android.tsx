import { type ReactElement, useRef } from 'react';
import type { ViewInstance, ViewProps } from 'react-native';

import { AnchoredTrigger } from '../anchored-trigger';
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
  const triggerRef = useRef<ViewInstance>(null);
  const { anchor, close, finishClose, isOpen, open } = useMenuState(triggerRef);
  const child = children as ReactElement<ViewProps & { disabled?: boolean }>;
  const isDisabled = Boolean(
    child.props.disabled ||
    child.props.accessibilityState?.disabled ||
    child.props.pointerEvents === 'none',
  );

  return (
    <>
      <AnchoredTrigger
        accessibilityLabel={child.props.accessibilityLabel}
        accessibilityState={child.props.accessibilityState}
        disabled={isDisabled}
        isOpen={isOpen}
        onOpen={open}
        onStartShouldSetResponderCapture={child.props.onStartShouldSetResponderCapture}
        triggerRef={triggerRef}
      >
        {children}
      </AnchoredTrigger>
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
