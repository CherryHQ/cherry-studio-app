import { ContextMenu } from '@cherrystudio/ui/components';
import { Link } from 'expo-router';

import type { ContextMenuLinkProps } from './ContextMenuLink.types';

export function ContextMenuLink({ children, href, items }: ContextMenuLinkProps) {
  return (
    <ContextMenu items={items}>
      <Link asChild href={href}>
        {children}
      </Link>
    </ContextMenu>
  );
}
