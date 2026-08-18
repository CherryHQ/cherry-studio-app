import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appSidebar } from '@/frontend/utils/constants';

/**
 * Geometry of the floating dock, shared by the dock itself and by the body that
 * has to scroll clear of it.
 *
 * `inset` makes the dock's corners concentric with the display's: a rounded
 * rect nested in another only looks right when the two share a center, which
 * means the gap has to equal the difference of their radii. Anything less and
 * the pill's corner visibly tightens against the screen's.
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
    /** Bottom padding: the concentric inset, never less than the home indicator. */
    bottomPadding: Math.max(inset, insets.bottom),
  };
}
