import type { ReactElement, Ref } from 'react';
import type { PressableProps, ViewInstance, ViewProps } from 'react-native';

/** Private window-space geometry. Zero width and height represent a pointer anchor. */
export type MenuAnchor = { height: number; pageX: number; pageY: number; width: number };

/** Semantic leading glyph; the menu implementation owns its artwork. */
export type MenuIcon = 'branch';

export type MenuItem = Readonly<{
  /** Contiguous items with the same group share a section. */
  group?: string;
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

/** A tap target whose enclosing context menu owns long-press recognition. */
export type ContextMenuTriggerProps = Omit<ViewProps, 'children' | 'style'> &
  Pick<PressableProps, 'children' | 'disabled' | 'style'> & {
    onPress?: () => void;
    ref?: Ref<ViewInstance>;
  };
