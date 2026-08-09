import { ContextMenu } from '@cherrystudio/ui';
import { Link } from 'expo-router';

import type { ContextMenuLinkProps } from './ContextMenuLink.types';

export function ContextMenuLink({ children, href, items }: ContextMenuLinkProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Link asChild href={href}>
          {children}
        </Link>
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        {items.map((item) =>
          item.isOn === undefined ? (
            <ContextMenu.Item
              destructive={item.role === 'destructive'}
              disabled={item.disabled}
              key={item.id}
              onSelect={item.onPress}
            >
              <ContextMenu.ItemTitle>{item.label}</ContextMenu.ItemTitle>
            </ContextMenu.Item>
          ) : (
            <ContextMenu.CheckboxItem
              disabled={item.disabled}
              key={item.id}
              onValueChange={item.onPress}
              value={item.isOn}
            >
              <ContextMenu.ItemTitle>{item.label}</ContextMenu.ItemTitle>
            </ContextMenu.CheckboxItem>
          ),
        )}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
