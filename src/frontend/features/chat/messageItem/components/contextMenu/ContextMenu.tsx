import { type MenuAction, MenuView } from '@expo/ui/community/menu';
import { useMemo } from 'react';

import type { ContextMenuProps } from './types';

export function ContextMenu({ actions, title, onPressAction, style, children }: ContextMenuProps) {
  const menuActions = useMemo<MenuAction[]>(
    () =>
      actions.map((action) => ({
        id: action.id,
        title: action.title,
        image: action.image as MenuAction['image'],
        attributes: {
          destructive: action.destructive,
          disabled: action.disabled,
        },
      })),
    [actions],
  );

  return (
    <MenuView
      title={title}
      actions={menuActions}
      shouldOpenOnLongPress
      onPressAction={({ nativeEvent }) => onPressAction?.(nativeEvent.event)}
      style={style}
    >
      {children}
    </MenuView>
  );
}
