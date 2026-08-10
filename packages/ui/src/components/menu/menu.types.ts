import type { MenuAction } from '@expo/ui/community/menu';
import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type MenuItem = {
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  label: string;
  onPress: () => void;
  role?: 'default' | 'destructive';
  systemImage?: Extract<MenuAction['image'], string>;
  testID?: string;
};

export type MenuProps = {
  children: ReactElement;
  items: readonly MenuItem[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};
