import { createContext, use, useEffect } from 'react';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import type { NavDestinationId, NavTabId } from './dockTabs';
import type { NavigationShellMode } from './shellMode';

export {
  canPinTab,
  canUnpinTab,
  DEFAULT_PINNED_TABS,
  getNavHref,
  getNavTitleKey,
  isMoreModuleId,
  isRootNavPathname,
  isUnpinnedModuleRoot,
  MAX_DOCK_TABS,
  MAX_MIDDLE_TABS,
  MORE_MODULE_IDS,
  normalizePinnedTabs,
  pinTab,
  reorderPinnedTab,
  resolveActiveDockTab,
  resolveCompactLeadingAction,
  resolveDockDragPreview,
  resolveDockTabs,
  resolveMoreModules,
  resolveNavDestination,
  unpinTab,
  WIDE_RAIL_DESTINATIONS,
  type DockDragPreviewInput,
  type DockDragPreviewState,
  type MoreModuleId,
  type NavDestinationId,
  type NavTabId,
} from './dockTabs';
export {
  DEFAULT_FLOATING_DOCK_ROW_HEIGHT,
  FILES_MASTER_WIDTH,
  FLOATING_DOCK_CLEARANCE_GAP,
  FLOATING_DOCK_MIN_BOTTOM_PADDING,
  FLOATING_DOCK_SAFE_AREA_OFFSET,
  resolveFloatingDockBottomPadding,
  resolveFloatingDockClearance,
  resolveNavigationShellMode,
  VERTICAL_RAIL_WIDTH,
  WIDE_RAIL_WIDTH,
  type NavigationShellMode,
} from './shellMode';

export type DockRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type NavPinPopoverState = {
  id: NavigationPinTabId;
  source: 'dock' | 'more';
  x: number;
  y: number;
};

export type NavDragState = {
  draggingOut: boolean;
  id: NavigationPinTabId;
  insertIndex: number;
  overDock: boolean;
  source: 'dock' | 'more';
  x: number;
  y: number;
};

export type NavigationNavigateOptions = {
  push?: boolean;
};

export type MiddleColumnSource = 'files' | 'sidebar';

export type MainNavigatorResult =
  | boolean
  | 'handled'
  | 'push'
  | 'replace'
  | { action: 'dismiss'; count: number };

export type MainNavigatorHandler = (id: NavDestinationId) => MainNavigatorResult;

export type NavigationShellContextValue = {
  activeDestination: NavDestinationId | undefined;
  activeDockTab: NavTabId | undefined;
  closePinPopover: () => void;
  dockClearance: number;
  dragState: NavDragState | null;
  endDrag: () => void;
  isAtRoot: boolean;
  isDockVisible: boolean;
  isFileListCollapsed: boolean;
  middleColumnWidth: number;
  navigateToDestination: (id: NavDestinationId, options?: NavigationNavigateOptions) => void;
  openPinPopover: (popover: NavPinPopoverState) => void;
  pinTabToDock: (id: NavigationPinTabId, insertIndex?: number) => boolean;
  pinnedTabs: NavigationPinTabId[];
  popover: NavPinPopoverState | null;
  registerDockRect: (rect: DockRect | null) => void;
  registerHideDock: () => () => void;
  registerMainNavigator: (handler: MainNavigatorHandler | null) => void;
  reorderMiddleTab: (id: NavigationPinTabId, targetIndex: number) => void;
  reportDockHeight: (height: number) => void;
  reportMiddleColumnWidth: (source: MiddleColumnSource, width: number) => void;
  restingDockHeight: number;
  setFileListCollapsed: (collapsed: boolean) => void;
  shellMode: NavigationShellMode;
  startDrag: (input: {
    id: NavigationPinTabId;
    source: 'dock' | 'more';
    x: number;
    y: number;
  }) => void;
  toggleFileListCollapsed: () => void;
  unpinTabFromDock: (id: NavigationPinTabId) => boolean;
  updateDrag: (x: number, y: number) => void;
};

export const NavigationShellContext = createContext<NavigationShellContextValue | null>(null);

export function useOptionalNavigationShell(): NavigationShellContextValue | null {
  return use(NavigationShellContext);
}

export function useNavigationShell(): NavigationShellContextValue {
  const value = use(NavigationShellContext);
  if (!value) {
    throw new Error('useNavigationShell must be used inside NavigationShellProvider');
  }
  return value;
}

/** Hides the compact floating dock while temporary overlays/composers own the bottom edge. */
export function useHideFloatingDock(hidden: boolean): void {
  const shell = useOptionalNavigationShell();
  const register = shell?.registerHideDock;

  useEffect(() => {
    if (!hidden || !register) return;
    return register();
  }, [hidden, register]);
}

/** Reports a permanent middle column width so BottomSheets center inside the open pane. */
export function useReportMiddleColumnWidth(source: MiddleColumnSource, width: number): void {
  const shell = useOptionalNavigationShell();
  const report = shell?.reportMiddleColumnWidth;

  useEffect(() => {
    if (!report) return;
    report(source, width);
    return () => {
      report(source, 0);
    };
  }, [report, source, width]);
}

/** Extra bottom padding above `insets.bottom` so scrollable roots and composers clear the dock. */
export function useNavigationDockClearance(): number {
  const shell = useOptionalNavigationShell();
  return shell?.dockClearance ?? 0;
}
