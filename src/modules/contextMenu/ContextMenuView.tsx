import { View } from 'react-native';

import type { ContextMenuViewProps } from './ContextMenuView.types';

// Non-iOS fallback: render the children inline without a context menu.
export function ContextMenuView({ children, style }: ContextMenuViewProps) {
  return <View style={style}>{children}</View>;
}
