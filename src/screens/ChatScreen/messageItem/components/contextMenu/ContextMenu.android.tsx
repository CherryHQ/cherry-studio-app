import { type MenuAction, MenuView } from '@expo/ui/community/menu';
import { useMemo } from 'react';

import type { ContextMenuProps } from './types';

// Android: @expo/ui community MenuView (Jetpack Compose menu), consistent with the
// rest of the app's menus. iOS uses our own native module instead (see .ios.tsx).
export function ContextMenu({
  actions,
  title,
  onPressAction,
  onOpenMenu,
  onCloseMenu,
  style,
  children,
}: ContextMenuProps) {
  const menuActions = useMemo<MenuAction[]>(
    () =>
      actions.map((action) => ({
        id: action.id,
        title: action.title,
        // SF Symbol strings aren't rendered on Android; harmless (text-only entry).
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
      onOpenMenu={onOpenMenu}
      onCloseMenu={onCloseMenu}
      style={style}
    >
      {children}
    </MenuView>
  );
}
