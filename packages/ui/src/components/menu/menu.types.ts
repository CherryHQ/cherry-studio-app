import type { ReactElement } from 'react';

/** Private window-space geometry shared by menu trigger and layout owners. */
export type MenuAnchor = { height: number; pageX: number; pageY: number; width: number };

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
