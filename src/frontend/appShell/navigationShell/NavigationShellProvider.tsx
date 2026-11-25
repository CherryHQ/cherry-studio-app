import { useToast } from '@cherrystudio/ui/components';
import { haptics } from '@cherrystudio/ui/haptics';
import { type Href, usePathname, useRouter } from 'expo-router';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFoldRegionLayout, useWindowClass } from '@/frontend/appShell/layout';
import { useFirstUseAdmission } from '@/frontend/appShell/navigation';
import { usePreference } from '@/frontend/data/hooks/usePreference';
import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import {
  canPinTab,
  canUnpinTab,
  getNavHref,
  isRootNavPathname,
  type NavDestinationId,
  normalizePinnedTabs,
  pinTab,
  reorderPinnedTab,
  resolveActiveDockTab,
  resolveNavDestination,
  unpinTab,
} from './dockTabs';
import {
  DEFAULT_FLOATING_DOCK_ROW_HEIGHT,
  resolveFloatingDockClearance,
  resolveNavigationShellMode,
} from './shellMode';
import {
  type DockRect,
  type MainNavigatorHandler,
  type MiddleColumnSource,
  type NavDragState,
  type NavigationNavigateOptions,
  type NavigationShellActions,
  NavigationShellActionsContext,
  NavigationShellContext,
  type NavigationShellInteraction,
  NavigationShellInteractionContext,
  type NavigationShellState,
  type NavPinPopoverState,
} from './state';

const DOCK_HIT_SLOP_TOP = 72;
const DOCK_HIT_SLOP_X = 16;
const DRAG_OUT_THRESHOLD = 56;
const RAIL_HIT_SLOP_X = 56;
const RAIL_HIT_SLOP_Y = 28;
const RAIL_DRAG_OUT_THRESHOLD = 56;

function resolveDragMetrics(
  dockRect: DockRect | null,
  pinnedCount: number,
  source: 'dock' | 'more',
  x: number,
  y: number,
  orientation: 'horizontal' | 'vertical',
): { draggingOut: boolean; insertIndex: number; overDock: boolean } {
  if (!dockRect || dockRect.width <= 0 || dockRect.height <= 0) {
    return { draggingOut: false, insertIndex: pinnedCount, overDock: false };
  }

  const maxMiddleSlot = Math.max(0, source === 'more' ? pinnedCount : pinnedCount - 1);

  if (orientation === 'vertical') {
    const overDock =
      x >= dockRect.x - RAIL_HIT_SLOP_X &&
      y >= dockRect.y - RAIL_HIT_SLOP_Y &&
      y <= dockRect.y + dockRect.height + RAIL_HIT_SLOP_Y;
    const draggingOut = source === 'dock' && x < dockRect.x - RAIL_DRAG_OUT_THRESHOLD;
    // Map across the centered middle band [18%..82%] vertically so top/bottom ends stay symmetrical.
    const middleStart = dockRect.height * 0.18;
    const middleHeight = Math.max(1, dockRect.height * 0.64);
    const normalizedY = Math.max(0, Math.min(0.999, (y - dockRect.y - middleStart) / middleHeight));
    const insertIndex = Math.floor(normalizedY * (maxMiddleSlot + 1));
    return { draggingOut, insertIndex, overDock };
  }

  const overDock =
    y >= dockRect.y - DOCK_HIT_SLOP_TOP &&
    x >= dockRect.x - DOCK_HIT_SLOP_X &&
    x <= dockRect.x + dockRect.width + DOCK_HIT_SLOP_X;

  const draggingOut = source === 'dock' && y < dockRect.y - DRAG_OUT_THRESHOLD;

  // Map across the centered middle band [18%..82%] so `chat` and `more` bookends leave symmetrical drop slots.
  const middleStart = dockRect.width * 0.18;
  const middleWidth = Math.max(1, dockRect.width * 0.64);
  const normalizedX = Math.max(0, Math.min(0.999, (x - dockRect.x - middleStart) / middleWidth));
  const insertIndex = Math.floor(normalizedX * (maxMiddleSlot + 1));

  return { draggingOut, insertIndex, overDock };
}

export function NavigationShellProvider({ children }: PropsWithChildren) {
  const [rawPinnedTabs, setRawPinnedTabs] = usePreference('ui.navigation.pinned_tabs');
  const pathname = usePathname();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const windowClass = useWindowClass();
  const fold = useFoldRegionLayout('window')?.fold ?? null;
  const { toast } = useToast();
  const { t } = useTranslation();

  const pinnedTabs = useMemo(() => normalizePinnedTabs(rawPinnedTabs), [rawPinnedTabs]);
  const shellMode = useMemo(
    () =>
      resolveNavigationShellMode({
        fold,
        height,
        insetLeft: insets.left,
        insetRight: insets.right,
        insetTop: insets.top,
        width,
        windowClass,
      }),
    [fold, height, insets.left, insets.right, insets.top, width, windowClass],
  );

  const activeDestination = useMemo(() => resolveNavDestination(pathname), [pathname]);
  const isAtRoot = useMemo(() => isRootNavPathname(pathname), [pathname]);
  const activeDockTab = useMemo(
    () => resolveActiveDockTab(activeDestination, pinnedTabs),
    [activeDestination, pinnedTabs],
  );

  const [hideDockCount, setHideDockCount] = useState(0);
  const [restingDockHeight, setRestingDockHeight] = useState(DEFAULT_FLOATING_DOCK_ROW_HEIGHT);
  const [columnWidths, setColumnWidths] = useState<{ files: number; sidebar: number }>({
    files: 0,
    sidebar: 0,
  });
  const [isFileListCollapsed, setFileListCollapsed] = useState(false);
  const [popover, setPopover] = useState<NavPinPopoverState | null>(null);
  const [dragState, setDragState] = useState<NavDragState | null>(null);

  const dragPositionX = useSharedValue(0);
  const dragPositionY = useSharedValue(0);
  const dragPosition = useMemo(
    () => ({ x: dragPositionX, y: dragPositionY }),
    [dragPositionX, dragPositionY],
  );

  const dragOrientation = shellMode === 'vertical-rail' ? 'vertical' : 'horizontal';

  const dockRectRef = useRef<DockRect | null>(null);
  const mainNavigatorRef = useRef<MainNavigatorHandler | null>(null);
  const dragStateRef = useRef<NavDragState | null>(null);
  const pinnedTabsRef = useRef(pinnedTabs);
  const pathnameRef = useRef(pathname);
  const dragOrientationRef = useRef<'horizontal' | 'vertical'>(dragOrientation);
  const setRawPinnedTabsRef = useRef(setRawPinnedTabs);
  const routerRef = useRef(router);
  const toastRef = useRef(toast);
  const tRef = useRef(t);

  useLayoutEffect(() => {
    pinnedTabsRef.current = pinnedTabs;
    pathnameRef.current = pathname;
    dragOrientationRef.current = dragOrientation;
    setRawPinnedTabsRef.current = setRawPinnedTabs;
    routerRef.current = router;
    toastRef.current = toast;
    tRef.current = t;
  });

  const isOnboardingBlocking = useFirstUseAdmission() !== 'admitted';
  const platform = Platform?.OS ?? 'ios';
  const isDockVisible =
    !isOnboardingBlocking && shellMode === 'compact-dock' && isAtRoot && hideDockCount === 0;
  const isVerticalRailVisible =
    !isOnboardingBlocking && shellMode === 'vertical-rail' && isAtRoot && hideDockCount === 0;
  const restingDockClearance =
    shellMode === 'compact-dock'
      ? resolveFloatingDockClearance(restingDockHeight, insets.bottom, platform)
      : 0;
  const dockClearance = isAtRoot && !isOnboardingBlocking ? restingDockClearance : 0;

  useEffect(() => {
    if ((!isAtRoot || shellMode === 'wide-rail') && dragStateRef.current) {
      dragStateRef.current = null;
      setDragState(null);
    }
  }, [isAtRoot, shellMode]);

  useEffect(() => {
    if (!dragState) return;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        setDragState(null);
      }
    });
    return () => subscription.remove();
  }, [dragState]);

  const middleColumnWidth =
    shellMode !== 'wide-rail'
      ? 0
      : activeDestination === 'files'
        ? columnWidths.files
        : activeDestination === 'chat' || activeDestination === 'settings'
          ? columnWidths.sidebar
          : 0;

  const registerHideDock = useCallback(() => {
    setHideDockCount((count) => count + 1);
    return () => {
      setHideDockCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const reportDockHeight = useCallback((nextHeight: number) => {
    if (nextHeight <= 0) return;
    setRestingDockHeight((prev) =>
      Math.abs(prev - nextHeight) < 1 ? prev : Math.round(nextHeight),
    );
  }, []);

  const reportMiddleColumnWidth = useCallback((source: MiddleColumnSource, nextWidth: number) => {
    const normalized = Math.max(0, Math.round(nextWidth));
    setColumnWidths((prev) =>
      prev[source] === normalized ? prev : { ...prev, [source]: normalized },
    );
  }, []);

  const registerDockRect = useCallback((rect: DockRect | null) => {
    dockRectRef.current = rect;
  }, []);

  const registerMainNavigator = useCallback((handler: MainNavigatorHandler | null) => {
    mainNavigatorRef.current = handler;
  }, []);

  const toggleFileListCollapsed = useCallback(() => {
    setFileListCollapsed((prev) => !prev);
  }, []);

  const openPinPopover = useCallback((next: NavPinPopoverState) => {
    haptics.light();
    setPopover(next);
  }, []);

  const closePinPopover = useCallback(() => {
    setPopover(null);
  }, []);

  const pinTabToDock = useCallback((id: NavigationPinTabId, insertIndex?: number): boolean => {
    const currentPinned = pinnedTabsRef.current;
    if (currentPinned.includes(id)) return false;
    if (!canPinTab(currentPinned, id)) {
      haptics.warning();
      toastRef.current.show({ label: tRef.current('navigation.dockFullToast') });
      return false;
    }
    const next = pinTab(currentPinned, id, insertIndex);
    void setRawPinnedTabsRef.current(next);
    haptics.medium();
    return true;
  }, []);

  const unpinTabFromDock = useCallback((id: NavigationPinTabId): boolean => {
    const currentPinned = pinnedTabsRef.current;
    if (!canUnpinTab(currentPinned, id)) {
      haptics.warning();
      toastRef.current.show({ label: tRef.current('navigation.coreTabCannotUnpin') });
      return false;
    }
    const next = unpinTab(currentPinned, id);
    void setRawPinnedTabsRef.current(next);
    haptics.light();
    return true;
  }, []);

  const reorderMiddleTab = useCallback((id: NavigationPinTabId, targetIndex: number) => {
    const currentPinned = pinnedTabsRef.current;
    const next = reorderPinnedTab(currentPinned, id, targetIndex);
    if (
      next.length === currentPinned.length &&
      next.every((item, index) => item === currentPinned[index])
    ) {
      return;
    }
    void setRawPinnedTabsRef.current(next);
    haptics.selection();
  }, []);

  const startDrag = useCallback(
    (input: { id: NavigationPinTabId; source: 'dock' | 'more'; x: number; y: number }) => {
      setPopover(null);
      dragPositionX.set(input.x);
      dragPositionY.set(input.y);
      haptics.medium();

      const currentPinned = pinnedTabsRef.current;
      const metrics = resolveDragMetrics(
        dockRectRef.current,
        currentPinned.length,
        input.source,
        input.x,
        input.y,
        dragOrientationRef.current,
      );
      const next: NavDragState = {
        id: input.id,
        source: input.source,
        overDock: metrics.overDock,
        insertIndex: metrics.insertIndex,
        draggingOut: metrics.draggingOut && canUnpinTab(currentPinned, input.id),
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [dragPositionX, dragPositionY],
  );

  const updateDrag = useCallback(
    (x: number, y: number) => {
      dragPositionX.set(x);
      dragPositionY.set(y);

      const current = dragStateRef.current;
      if (!current) return;

      const currentPinned = pinnedTabsRef.current;
      const metrics = resolveDragMetrics(
        dockRectRef.current,
        currentPinned.length,
        current.source,
        x,
        y,
        dragOrientationRef.current,
      );
      const nextDraggingOut = metrics.draggingOut && canUnpinTab(currentPinned, current.id);
      if ((!current.overDock && metrics.overDock) || (!current.draggingOut && nextDraggingOut)) {
        haptics.light();
      } else if (metrics.overDock && current.insertIndex !== metrics.insertIndex) {
        haptics.selection();
      }

      if (
        current.overDock === metrics.overDock &&
        current.insertIndex === metrics.insertIndex &&
        current.draggingOut === nextDraggingOut
      ) {
        return;
      }

      const next: NavDragState = {
        ...current,
        overDock: metrics.overDock,
        insertIndex: metrics.insertIndex,
        draggingOut: nextDraggingOut,
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [dragPositionX, dragPositionY],
  );

  const endDrag = useCallback(() => {
    const current = dragStateRef.current;
    dragStateRef.current = null;
    setDragState(null);
    if (!current) return;

    if (current.source === 'more' && current.overDock) {
      pinTabToDock(current.id, current.insertIndex);
      return;
    }

    if (current.source === 'dock') {
      if (current.draggingOut) {
        unpinTabFromDock(current.id);
        return;
      }
      if (current.overDock) {
        reorderMiddleTab(current.id, current.insertIndex);
      }
    }
  }, [pinTabToDock, reorderMiddleTab, unpinTabFromDock]);

  const navigateToDestination = useCallback(
    (id: NavDestinationId, options?: NavigationNavigateOptions) => {
      setPopover(null);
      const href = getNavHref(id) as Href;
      const currentRouter = routerRef.current;

      if (options?.push) {
        currentRouter.push(href);
        return;
      }
      if (mainNavigatorRef.current?.(id, currentRouter, href)) {
        return;
      }
      if (id === 'settings') {
        if (pathnameRef.current.startsWith('/settings/')) currentRouter.dismissTo(href);
        else if (pathnameRef.current !== '/settings') currentRouter.push(href);
        return;
      }
      if (resolveNavDestination(pathnameRef.current) === 'settings') {
        currentRouter.dismissTo(href);
        return;
      }
      if (id === 'chat') {
        currentRouter.navigate('/');
        return;
      }
      if (pathnameRef.current === '/') {
        currentRouter.push(href);
        return;
      }
      currentRouter.replace(href);
    },
    [],
  );

  const stateValue = useMemo<NavigationShellState>(
    () => ({
      activeDestination,
      activeDockTab,
      dockClearance,
      isAtRoot,
      isDockVisible,
      isOnboardingBlocking,
      isFileListCollapsed,
      isVerticalRailVisible,
      middleColumnWidth,
      pinnedTabs,
      restingDockClearance,
      restingDockHeight,
      shellMode,
    }),
    [
      activeDestination,
      activeDockTab,
      dockClearance,
      isAtRoot,
      isDockVisible,
      isOnboardingBlocking,
      isFileListCollapsed,
      isVerticalRailVisible,
      middleColumnWidth,
      pinnedTabs,
      restingDockClearance,
      restingDockHeight,
      shellMode,
    ],
  );

  const actionsValue = useMemo<NavigationShellActions>(
    () => ({
      closePinPopover,
      endDrag,
      navigateToDestination,
      openPinPopover,
      pinTabToDock,
      registerDockRect,
      registerHideDock,
      registerMainNavigator,
      reorderMiddleTab,
      reportDockHeight,
      reportMiddleColumnWidth,
      setFileListCollapsed,
      startDrag,
      toggleFileListCollapsed,
      unpinTabFromDock,
      updateDrag,
    }),
    [
      closePinPopover,
      endDrag,
      navigateToDestination,
      openPinPopover,
      pinTabToDock,
      registerDockRect,
      registerHideDock,
      registerMainNavigator,
      reorderMiddleTab,
      reportDockHeight,
      reportMiddleColumnWidth,
      startDrag,
      toggleFileListCollapsed,
      unpinTabFromDock,
      updateDrag,
    ],
  );

  const interactionValue = useMemo<NavigationShellInteraction>(
    () => ({
      dragPosition,
      dragState,
      popover,
    }),
    [dragPosition, dragState, popover],
  );

  return (
    <NavigationShellActionsContext value={actionsValue}>
      <NavigationShellContext value={stateValue}>
        <NavigationShellInteractionContext value={interactionValue}>
          {children}
        </NavigationShellInteractionContext>
      </NavigationShellContext>
    </NavigationShellActionsContext>
  );
}
