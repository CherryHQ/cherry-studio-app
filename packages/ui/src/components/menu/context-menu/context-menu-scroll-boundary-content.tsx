import { useMemo } from 'react';

import type {
  ContextMenuScrollBoundaryProps,
  ContextMenuScrollHandlers,
} from './context-menu-scroll-boundary.types';

export function ContextMenuScrollBoundaryContent({
  children,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onScrollBeginDrag,
  onScrollEndDrag,
  onTouchCancel,
  onTouchEnd,
  onTouchStart,
}: ContextMenuScrollBoundaryProps) {
  const handlers = useMemo<ContextMenuScrollHandlers>(
    () => ({
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      onScrollBeginDrag,
      onScrollEndDrag,
      onTouchCancel,
      onTouchEnd,
      onTouchStart,
    }),
    [
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      onScrollBeginDrag,
      onScrollEndDrag,
      onTouchCancel,
      onTouchEnd,
      onTouchStart,
    ],
  );

  return children(handlers);
}
