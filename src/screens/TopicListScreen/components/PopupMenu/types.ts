import type { ReactNode } from 'react';
import type { View } from 'react-native';

export type PopupMenuItem = {
  id: string;
  icon?: ReactNode;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export type PopupMenuProps = {
  visible: boolean;
  anchorRef: React.RefObject<View | null>;
  containerRef: React.RefObject<View | null>;
  items: PopupMenuItem[];
  onClose: () => void;
  closeAccessibilityLabel?: string;
};
