import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type ContextMenuAction = {
  // Returned via onPressAction when this entry is tapped.
  id: string;
  title: string;
  // SF Symbol name on iOS (e.g. "doc.on.doc", "pencil").
  image?: string;
  destructive?: boolean;
  disabled?: boolean;
};

export type ContextMenuActionEventPayload = {
  id: string;
};

export type ContextMenuActionEvent = NativeSyntheticEvent<ContextMenuActionEventPayload>;

export type ContextMenuViewProps = ViewProps & {
  actions: ContextMenuAction[];
  // Title shown above the menu items. Empty/omitted -> no title.
  title?: string;
  // Corner radius (pt) used to clip the lifted long-press preview so it hugs the
  // child. Defaults to 14 (matches the `rounded-xl` bubble).
  previewCornerRadius?: number;
  onPressAction?: (event: ContextMenuActionEvent) => void;
  onOpenMenu?: () => void;
  onCloseMenu?: () => void;
};
