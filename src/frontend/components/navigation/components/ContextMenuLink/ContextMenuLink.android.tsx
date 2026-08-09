import { Menu } from '@cherrystudio/ui';
import { Link } from 'expo-router';

import type { ContextMenuLinkProps } from './ContextMenuLink.types';

export function ContextMenuLink({ children, href, items }: ContextMenuLinkProps) {
  return (
    <Menu items={items} shouldOpenOnLongPress>
      <Link asChild href={href}>
        {children}
      </Link>
    </Menu>
  );
}
