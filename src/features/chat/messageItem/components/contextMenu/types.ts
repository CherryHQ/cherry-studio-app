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
  // iOS only: corner radius (pt) used to clip the lifted long-press preview so it
  // hugs the child. Defaults to 14 (matches the `rounded-xl` bubble).
  previewCornerRadius?: number;
  onPressAction?: (id: string) => void;
  onOpenMenu?: () => void;
  onCloseMenu?: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};
