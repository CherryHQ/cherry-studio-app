import { getComposerActionCenterOffset } from '@cherrystudio/ui/components';
import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appSidebar } from '@/frontend/utils/constants';

/**
 * Geometry of the floating dock, shared by the dock itself and by the body that
 * has to scroll clear of it.
 *
 * Horizontal spacing follows the display's corner radius, mirrored at the
 * drawer's straight right edge. Vertical placement aligns both button centers
 * with the chat composer's send action through its public layout contract.
 */
export function useDockMetrics() {
  const insets = useSafeAreaInsets();
  const buttonRadius = appSidebar.dockHeight / 2;
  const screenRadius = getCornerRadiusSync() ?? appSidebar.fallbackCornerRadius;
  // Floored for the (hypothetical) device whose radius is under the pill's.
  const inset = Math.max(screenRadius - buttonRadius, appSidebar.dockMinInset);

  return {
    /** Horizontal inset from the sidebar's edges. */
    inset,
    /** Aligns the dock's button centers with the composer's bottom action row. */
    bottomPadding: getComposerActionCenterOffset(insets.bottom) - buttonRadius,
  };
}
