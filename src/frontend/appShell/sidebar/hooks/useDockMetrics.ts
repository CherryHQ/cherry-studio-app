import { getComposerActionCenterOffset } from '@cherrystudio/ui/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatDockFooterHeight } from '@/frontend/appShell/layout';
import { appSidebar } from '@/frontend/utils/constants';

/**
 * Geometry of the floating dock, shared by the dock itself and by the body that
 * has to scroll clear of it.
 *
 * Horizontal spacing uses the dock's minimum inset and the leading safe area. The sidebar sits at
 * the window's leading edge, overlay or column, so the trailing safe area (such as an iPhone Duo's
 * status bar down the far side) never reaches it.
 * Vertical placement aligns both button centers with the chat composer's send
 * action through its public layout contract.
 */
export function useDockMetrics() {
  const insets = useSafeAreaInsets();
  const footerHeight = useChatDockFooterHeight();
  const buttonRadius = appSidebar.dockHeight / 2;

  return {
    /** Inset from the sidebar's leading edge. */
    insetStart: Math.max(appSidebar.dockMinInset, insets.left),
    /** Inset from the sidebar's trailing edge. */
    insetEnd: appSidebar.dockMinInset,
    /** Aligns the dock's button centers with the composer's bottom action row. */
    bottomPadding: getComposerActionCenterOffset(insets.bottom) + footerHeight - buttonRadius,
  };
}
