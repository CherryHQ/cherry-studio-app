import { ContextMenu } from '@cherrystudio/ui/components';
import { Link } from 'expo-router';
import { cloneElement, type ReactElement } from 'react';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';

import type { ContextMenuLinkProps } from './ContextMenuLink.types';

type AccessibilityChildProps = {
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

export function ContextMenuLink({ children, href, items }: ContextMenuLinkProps) {
  return (
    <ContextMenu items={items}>
      <Link asChild href={href}>
        {withContextMenuAccessibility(children, items)}
      </Link>
    </ContextMenu>
  );
}

function withContextMenuAccessibility(
  children: ReactElement,
  items: ContextMenuLinkProps['items'],
) {
  const actionableItems = items.filter((item) => !item.disabled);
  const child = children as ReactElement<AccessibilityChildProps>;
  const { accessibilityActions = [], onAccessibilityAction } = child.props;
  const menuItemNames = new Set(items.map((item) => item.id));

  return cloneElement(child, {
    accessibilityActions: [
      ...accessibilityActions.filter((action) => !menuItemNames.has(action.name)),
      ...actionableItems.map((item) => ({ label: item.label, name: item.id })),
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (!menuItemNames.has(event.nativeEvent.actionName)) {
        onAccessibilityAction?.(event);
      }
    },
  });
}
