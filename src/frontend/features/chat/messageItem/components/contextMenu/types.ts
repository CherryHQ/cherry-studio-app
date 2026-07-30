import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type ContextMenuAction = {
  // Returned via onPressAction when this entry is tapped.
  id: string;
  title: string;
  // iOS: SF Symbol name (e.g. "doc.on.doc"). Android (@expo/ui): SF Symbol strings
  // aren't rendered, so the entry shows as text-only there.
  image?: string;
  destructive?: boolean;
  disabled?: boolean;
};

export type ContextMenuProps = {
  actions: ContextMenuAction[];
  // Title shown above the menu items. Omitted -> no title.
  title?: string;
  onPressAction?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};
