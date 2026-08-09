import type { MenuItem } from '@cherrystudio/ui';
import type { Href } from 'expo-router';
import type { ReactElement } from 'react';

export type ContextMenuLinkProps = {
  children: ReactElement;
  href: Href;
  items: readonly MenuItem[];
};
