import type { ReactElement } from 'react';

export type MenuItem = Readonly<{
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  id: string;
  label: string;
  onPress: () => void;
}>;

export type MenuProps = {
  children: ReactElement;
  items: readonly MenuItem[];
  trigger: 'longPress' | 'tap';
};
