import { Link } from 'expo-router';

import type { ContextMenuLinkProps } from './ContextMenuLink.types';

export function ContextMenuLink({ children, href, items }: ContextMenuLinkProps) {
  return (
    <Link href={href}>
      <Link.Trigger>{children}</Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {items.map((item) => (
          <Link.MenuAction
            destructive={item.role === 'destructive'}
            disabled={item.disabled}
            icon={item.systemImage}
            isOn={item.isOn}
            key={item.id}
            onPress={item.onPress}
          >
            {item.label}
          </Link.MenuAction>
        ))}
      </Link.Menu>
    </Link>
  );
}
