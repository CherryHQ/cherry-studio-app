import type { ReactElement } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

export type MenuSystemImage = SFSymbol;

export type MenuItem = Readonly<{
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  id: string;
  label: string;
  onPress: () => void;
  systemImage?: MenuSystemImage;
}>;

export type MenuProps = {
  children: ReactElement;
  items: readonly MenuItem[];
  trigger: 'longPress' | 'tap';
};
