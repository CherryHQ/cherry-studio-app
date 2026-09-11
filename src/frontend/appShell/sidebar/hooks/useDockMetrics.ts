import { getComposerActionCenterOffset } from '@cherrystudio/ui/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appSidebar } from '@/frontend/utils/constants';

/**
 * Geometry of the floating dock, shared by the dock itself and by the body that
 * has to scroll clear of it.
 *
 * Horizontal spacing uses the dock's minimum inset and the window's safe area.
 * Vertical placement aligns both button centers with the chat composer's send
 * action through its public layout contract.
 */
export function useDockMetrics() {
  const insets = useSafeAreaInsets();
  const buttonRadius = appSidebar.dockHeight / 2;
  const inset = Math.max(appSidebar.dockMinInset, insets.left, insets.right);

  return {
    /** Horizontal inset from the sidebar's edges. */
    inset,
    /** Aligns the dock's button centers with the composer's bottom action row. */
    bottomPadding: getComposerActionCenterOffset(insets.bottom) - buttonRadius,
  };
}
