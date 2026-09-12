import { ContextMenuScrollBoundaryContent } from './context-menu-scroll-boundary-content';
import type { ContextMenuScrollBoundaryProps } from './context-menu-scroll-boundary.types';

/** UIKit already arbitrates context menus against its scroll ancestors. */
export function ContextMenuScrollBoundary({
  children,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onScrollBeginDrag,
  onScrollEndDrag,
  onTouchCancel,
  onTouchEnd,
  onTouchStart,
}: ContextMenuScrollBoundaryProps) {
  return (
    <ContextMenuScrollBoundaryContent
      onMomentumScrollBegin={onMomentumScrollBegin}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onTouchCancel={onTouchCancel}
      onTouchEnd={onTouchEnd}
      onTouchStart={onTouchStart}
    >
      {children}
    </ContextMenuScrollBoundaryContent>
  );
}
