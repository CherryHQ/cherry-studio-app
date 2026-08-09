import type { Href } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';
import type * as ContextMenu from 'zeego/context-menu';

type ContextMenuSystemImage = NonNullable<
  ComponentProps<typeof ContextMenu.ItemIcon>['ios']
>['name'];

export type ContextMenuLinkItem = {
  disabled?: boolean;
  id: string;
  isOn?: boolean;
  label: string;
  onPress: () => void;
  role?: 'default' | 'destructive';
  systemImage?: ContextMenuSystemImage;
};

export type ContextMenuLinkProps = {
  children: ReactElement;
  href: Href;
  items: readonly ContextMenuLinkItem[];
  preview?: boolean;
};
