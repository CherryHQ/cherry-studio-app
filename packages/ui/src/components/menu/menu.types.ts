import type { ReactElement } from 'react';

/** Semantic leading glyph; the menu implementation owns its artwork. */
export type MenuIcon = 'branch';

export type MenuItem = Readonly<{
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  icon?: MenuIcon;
  id: string;
  label: string;
  onPress: () => void;
}>;

export type ActionMenuProps = {
  children: ReactElement;
  items: readonly MenuItem[];
};

export type ContextMenuProps = {
  children: ReactElement;
  items: readonly MenuItem[];
};
