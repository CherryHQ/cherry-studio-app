import { ContextMenuView } from '@/modules/contextMenu';

import type { ContextMenuProps } from './types';

// iOS: our own native module (UIKit UIContextMenuInteraction + a rounded
// UITargetedPreview that hugs the bubble). Lets RN measure the children normally
// so the message row doesn't shift, while keeping the native lifted-preview
// long-press. (@expo/ui's SwiftUI menu under-measures and causes layout shift.)
export function ContextMenu({
  actions,
  title,
  previewCornerRadius,
  onPressAction,
  onOpenMenu,
  onCloseMenu,
  style,
  children,
}: ContextMenuProps) {
  return (
    <ContextMenuView
      actions={actions}
      title={title}
      previewCornerRadius={previewCornerRadius}
      onPressAction={({ nativeEvent }) => onPressAction?.(nativeEvent.id)}
      onOpenMenu={onOpenMenu}
      onCloseMenu={onCloseMenu}
      style={style}
    >
      {children}
    </ContextMenuView>
  );
}
