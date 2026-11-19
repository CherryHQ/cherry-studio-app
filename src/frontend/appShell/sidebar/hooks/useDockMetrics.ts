import { getComposerActionCenterOffset } from '@cherrystudio/ui/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatDockFooterHeight } from '@/frontend/appShell/layout';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';

/**
 * Geometry of the floating dock, shared by the dock itself and by the body that
 * has to scroll clear of it.
 *
 * Horizontal spacing uses the dock's minimum inset and the leading safe area. The sidebar sits at
 * the window's leading edge, overlay or column, so the trailing safe area (such as an iPhone Duo's
 * status bar down the far side) never reaches it.
 * Vertical placement keeps the profile and selection controls aligned with the chat composer's
 * send action through its public layout contract.
 */
export function useDockMetrics() {
  const insets = useSafeAreaInsets();
  const footerHeight = useChatDockFooterHeight();
  const isSelecting = useSidebarSelectionSnapshot((state) => state.isSelecting);
  const buttonRadius = appSidebar.dockHeight / 2;
  const bottomPadding = getComposerActionCenterOffset(insets.bottom) + footerHeight - buttonRadius;
  const normalContentHeight = appSidebar.dockHeight * 2 + appSidebar.dockRowGap;
  const contentHeight = isSelecting ? appSidebar.dockHeight : normalContentHeight;
  const fadeHeight = appSidebar.headerGapY * 2;

  return {
    /** Inset from the sidebar's leading edge. */
    insetStart: Math.max(appSidebar.dockMinInset, insets.left),
    /** Inset from the sidebar's trailing edge. */
    insetEnd: appSidebar.dockMinInset,
    /** Aligns the profile and selection controls with the composer's bottom action row. */
    bottomPadding,
    contentHeight,
    normalContentHeight,
    fadeHeight,
    backgroundHeight: bottomPadding + contentHeight + fadeHeight,
    normalBackgroundHeight: bottomPadding + normalContentHeight + fadeHeight,
    selectionBackgroundHeight: bottomPadding + appSidebar.dockHeight + fadeHeight,
    scrollBottomPadding: bottomPadding + contentHeight + appSidebar.headerGapY,
  };
}
