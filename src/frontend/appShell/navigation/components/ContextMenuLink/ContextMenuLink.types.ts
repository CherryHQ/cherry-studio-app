import type { MenuItem } from '@cherrystudio/ui/components';
import type { Href } from 'expo-router';
import type { ReactElement } from 'react';

export type ContextMenuLinkItem = MenuItem;

export type ContextMenuLinkProps = {
  children: ReactElement;
  href: Href;
  items: readonly ContextMenuLinkItem[];
  preview?: boolean;
};
