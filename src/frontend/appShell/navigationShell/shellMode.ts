import { isAcross, type FoldRegion, type WindowClass } from '@/frontend/appShell/layout';

export type NavigationShellMode = 'compact-dock' | 'wide-rail' | 'vertical-rail';

export const WIDE_RAIL_WIDTH = 60;
export const VERTICAL_RAIL_WIDTH = 64;
export const FILES_MASTER_WIDTH = 288;

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
  insetRight,
  insetTop,
  width,
  windowClass,
}: ShellModeInput): NavigationShellMode {
  const hasTrailingSystemBar =
    width > 0 &&
    height > 0 &&
    insetRight >= VERTICAL_SYSTEM_INSET_MIN &&
    insetTop <= VERTICAL_TOP_INSET_MAX;

  if (hasTrailingSystemBar || (fold && !isAcross(fold) && windowClass === 'compact')) {
    return 'vertical-rail';
  }

  return windowClass === 'wide' ? 'wide-rail' : 'compact-dock';
}
