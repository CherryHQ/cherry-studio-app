import type { Href } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import { type ContextType, createContext, use, useEffect, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import type { NavDestinationId, NavTabId } from './dockTabs';
import type { NavigationShellMode } from './shellMode';

export {
  canPinTab,
  canUnpinTab,
  DEFAULT_PINNED_TABS,
  getNavHref,
  getNavStackRoute,
  getNavTitleKey,
  isMoreModuleId,
  isRootNavPathname,
  isUnpinnedModuleRoot,
  MAX_DOCK_TABS,
  MAX_MIDDLE_TABS,
  MORE_MODULE_IDS,
  NAV_DESTINATION_IDS,
  NAV_ROUTE_MANIFEST,
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
  type NavRouteSpec,
  type NavTabId,
} from './dockTabs';
export {
  DEFAULT_FLOATING_DOCK_ROW_HEIGHT,
  FILES_MASTER_WIDTH,
  FLOATING_DOCK_ANDROID_BOTTOM_GAP,
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

/** Discrete drag metadata kept in React state; continuous coordinates live in SharedValues. */
export type NavDragState = {
  draggingOut: boolean;
  id: NavigationPinTabId;
  insertIndex: number;
  overDock: boolean;
  source: 'dock' | 'more';
};

export type NavDragPosition = {
  x: SharedValue<number>;
  y: SharedValue<number>;
};

export type NavigationNavigateOptions = {
  push?: boolean;
};

export type MiddleColumnSource = 'files' | 'sidebar';

export type MainStackRouterLike = {
  dismiss: (count?: number) => void;
  dismissTo: (href: Href) => void;
  push: (href: Href) => void;
  replace: (href: Href) => void;
};

export type MainNavigatorHandler = (
  id: NavDestinationId,
  router: MainStackRouterLike,
  href: Href,
) => boolean;

export type NavigationShellState = {
  activeDestination: NavDestinationId | undefined;
  activeDockTab: NavTabId | undefined;
  dockClearance: number;
  isAtRoot: boolean;
  isDockVisible: boolean;
  isOnboardingBlocking: boolean;
  isFileListCollapsed: boolean;
  isVerticalRailVisible: boolean;
  middleColumnWidth: number;
  pinnedTabs: NavigationPinTabId[];
  restingDockClearance: number;
  restingDockHeight: number;
  shellMode: NavigationShellMode;
};

export type NavigationShellActions = {
  closePinPopover: () => void;
  endDrag: () => void;
  navigateToDestination: (id: NavDestinationId, options?: NavigationNavigateOptions) => void;
  openPinPopover: (popover: NavPinPopoverState) => void;
  pinTabToDock: (id: NavigationPinTabId, insertIndex?: number) => boolean;
  registerDockRect: (rect: DockRect | null) => void;
  registerHideDock: () => () => void;
  registerMainNavigator: (handler: MainNavigatorHandler | null) => void;
  reorderMiddleTab: (id: NavigationPinTabId, targetIndex: number) => void;
  reportDockHeight: (height: number) => void;
  reportMiddleColumnWidth: (source: MiddleColumnSource, width: number) => void;
  setFileListCollapsed: (collapsed: boolean) => void;
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

export type NavigationShellInteraction = {
  dragPosition: NavDragPosition;
  dragState: NavDragState | null;
  popover: NavPinPopoverState | null;
};

export type NavigationShellContextValue = NavigationShellState & NavigationShellActions;

export const NavigationShellContext = createContext<NavigationShellState | null>(null);
export const NavigationShellActionsContext = createContext<NavigationShellActions | null>(null);
export const NavigationShellInteractionContext = createContext<NavigationShellInteraction | null>(
  null,
);

export function useOptionalNavigationShell(): NavigationShellState | null {
  return use(NavigationShellContext);
}

export function useOptionalNavigationShellActions(): NavigationShellActions | null {
  return use(NavigationShellActionsContext);
}

export function useNavigationShellActions(): NavigationShellActions {
  const actions = use(NavigationShellActionsContext);
  if (!actions) {
    throw new Error('useNavigationShellActions must be used inside NavigationShellProvider');
  }
  return actions;
}

export function useNavigationShellInteraction(): NavigationShellInteraction {
  const interaction = use(NavigationShellInteractionContext);
  if (!interaction) {
    throw new Error('useNavigationShellInteraction must be used inside NavigationShellProvider');
  }
  return interaction;
}

export function useNavigationShell(): NavigationShellContextValue {
  const state = use(NavigationShellContext);
  const actions = use(NavigationShellActionsContext);
  if (!state || !actions) {
    throw new Error('useNavigationShell must be used inside NavigationShellProvider');
  }
  return useMemo(() => ({ ...state, ...actions }), [actions, state]);
}

const FALLBACK_NAVIGATION_CONTEXT = createContext<
  ContextType<typeof NavigationContext> | undefined
>(undefined);

/**
 * Hides the compact floating dock while temporary overlays/composers own the bottom edge of a
 * focused screen, releasing the registration if another route covers it in the stack.
 */
export function useHideFloatingDock(hidden: boolean): void {
  const register = useOptionalNavigationShellActions()?.registerHideDock;
  const navigation = use(NavigationContext ?? FALLBACK_NAVIGATION_CONTEXT);

  useEffect(() => {
    if (!hidden || !register) return;
    if (
      !navigation ||
      typeof navigation.isFocused !== 'function' ||
      typeof navigation.addListener !== 'function'
    ) {
      return register();
    }

    let unregister: (() => void) | undefined;
    const acquire = () => {
      if (!unregister) {
        unregister = register();
      }
    };
    const release = () => {
      if (!unregister) return;
      const cleanup = unregister;
      unregister = undefined;
      cleanup();
    };

    if (navigation.isFocused()) {
      acquire();
    }
    const unsubscribeFocus = navigation.addListener('focus', acquire);
    const unsubscribeBlur = navigation.addListener('blur', release);

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      release();
    };
  }, [hidden, navigation, register]);
}

/** Reports a permanent middle column width so BottomSheets center inside the open pane. */
export function useReportMiddleColumnWidth(source: MiddleColumnSource, width: number): void {
  const report = useOptionalNavigationShellActions()?.reportMiddleColumnWidth;

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

/** Stable compact-dock bottom clearance for root screens so secondary pushes/pops never reflow. */
export function useRootNavigationDockClearance(): number {
  const shell = useOptionalNavigationShell();
  return shell?.restingDockClearance ?? 0;
}
