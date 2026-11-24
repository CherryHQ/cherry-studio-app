import { isAcross, type FoldRegion, type WindowClass } from '@/frontend/appShell/layout';

export type NavigationShellMode = 'compact-dock' | 'wide-rail' | 'vertical-rail';

export const WIDE_RAIL_WIDTH = 60;
export const VERTICAL_RAIL_WIDTH = 64;
export const FILES_MASTER_WIDTH = 288;
export const DEFAULT_FLOATING_DOCK_ROW_HEIGHT = 44;
export const FLOATING_DOCK_CLEARANCE_GAP = 10;
export const FLOATING_DOCK_SAFE_AREA_OFFSET = 16;
export const FLOATING_DOCK_ANDROID_BOTTOM_GAP = 6;
export const FLOATING_DOCK_MIN_BOTTOM_PADDING = 12;

export function resolveFloatingDockBottomPadding(
  bottomInset: number,
  platform: string = 'ios',
): number {
  if (platform === 'android') {
    return Math.max(
      bottomInset + FLOATING_DOCK_ANDROID_BOTTOM_GAP,
      FLOATING_DOCK_MIN_BOTTOM_PADDING,
    );
  }
  return Math.max(bottomInset - FLOATING_DOCK_SAFE_AREA_OFFSET, FLOATING_DOCK_MIN_BOTTOM_PADDING);
}

/** Bottom clearance above `bottomInset` needed for overlays/composers to rest 8pt clear of the dock. */
export function resolveFloatingDockClearance(
  rowHeight: number,
  bottomInset: number,
  platform: string = 'ios',
): number {
  return (
    Math.max(0, resolveFloatingDockBottomPadding(bottomInset, platform) + rowHeight - bottomInset) +
    FLOATING_DOCK_CLEARANCE_GAP
  );
}

const VERTICAL_LEADING_INSET_MAX = 24;
const VERTICAL_SYSTEM_INSET_MIN = 44;
const VERTICAL_TOP_INSET_MAX = 24;

type ShellModeInput = {
  fold: FoldRegion | null;
  height: number;
  insetLeft: number;
  insetRight: number;
  insetTop: number;
  width: number;
  windowClass: WindowClass;
};

/**
 * Resolves the active navigation shell posture from window geometry and platform safe areas:
 * - `vertical-rail`: Foldable display whose OS bar runs down the trailing edge (e.g. iPhone Duo outer/landscape).
 * - `wide-rail`: Large tablet / landscape desktop-class width with permanent 60pt left icon rail.
 * - `compact-dock`: Phone / split-screen / narrow windows with bottom floating dock.
 */
export function resolveNavigationShellMode({
  fold,
  height,
  insetLeft,
  insetRight,
  insetTop,
  width,
  windowClass,
}: ShellModeInput): NavigationShellMode {
  const hasTrailingSystemBar =
    width > 0 &&
    height > 0 &&
    insetLeft <= VERTICAL_LEADING_INSET_MAX &&
    insetRight >= VERTICAL_SYSTEM_INSET_MIN &&
    insetTop <= VERTICAL_TOP_INSET_MAX;

  if (hasTrailingSystemBar || (fold && !isAcross(fold) && windowClass === 'compact')) {
    return 'vertical-rail';
  }

  return windowClass === 'wide' ? 'wide-rail' : 'compact-dock';
}
