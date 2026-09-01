import type { ReactElement } from 'react';

/** Semantic leading glyph; the native view owns each platform's artwork. */
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

export type MenuProps = {
  children: ReactElement;
  items: readonly MenuItem[];
  trigger: 'longPress' | 'tap';
};
