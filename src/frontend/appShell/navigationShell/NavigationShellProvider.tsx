import { useToast } from '@cherrystudio/ui/components';
import * as Haptics from 'expo-haptics';
import { type Href, usePathname, useRouter } from 'expo-router';
import { type PropsWithChildren, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFoldRegionLayout, useWindowClass } from '@/frontend/appShell/layout';
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
  NavigationShellContext,
  type NavigationShellContextValue,
  type NavPinPopoverState,
} from './state';

const DOCK_HIT_SLOP_TOP = 36;
const DOCK_HIT_SLOP_X = 16;
const DRAG_OUT_THRESHOLD = 52;

function resolveDragMetrics(
  dockRect: DockRect | null,
  pinnedCount: number,
  source: 'dock' | 'more',
  x: number,
  y: number,
): { draggingOut: boolean; insertIndex: number; overDock: boolean } {
  if (!dockRect || dockRect.width <= 0) {
    return { draggingOut: false, insertIndex: pinnedCount, overDock: false };
  }

  const overDock =
    y >= dockRect.y - DOCK_HIT_SLOP_TOP &&
    x >= dockRect.x - DOCK_HIT_SLOP_X &&
    x <= dockRect.x + dockRect.width + DOCK_HIT_SLOP_X;

  const draggingOut = source === 'dock' && y < dockRect.y - DRAG_OUT_THRESHOLD;

  const totalTabs = pinnedCount + 2;
  const maxMiddleSlot = Math.max(0, source === 'more' ? pinnedCount : pinnedCount - 1);
  const relativeX = Math.max(0, Math.min(dockRect.width, x - dockRect.x));
  const rawSlot = Math.floor(
    (relativeX / dockRect.width) * (totalTabs + (source === 'more' ? 1 : 0)),
  );
  // Middle slots begin after `chat` (index 0) and stop before `more`.
  const insertIndex = Math.max(0, Math.min(maxMiddleSlot, rawSlot - 1));

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
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
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

  const dockRectRef = useRef<DockRect | null>(null);
  const mainNavigatorRef = useRef<MainNavigatorHandler | null>(null);
  const dragStateRef = useRef<NavDragState | null>(null);

  const isDockVisible =
    shellMode === 'compact-dock' && isAtRoot && !isKeyboardVisible && hideDockCount === 0;
  const dockClearance =
    shellMode === 'compact-dock' && isAtRoot
      ? resolveFloatingDockClearance(restingDockHeight, insets.bottom)
      : 0;

  const middleColumnWidth =
    shellMode !== 'wide-rail'
      ? 0
      : activeDestination === 'files'
        ? columnWidths.files
        : activeDestination === 'chat'
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setPopover(next);
  }, []);

  const closePinPopover = useCallback(() => {
    setPopover(null);
  }, []);

  const pinTabToDock = useCallback(
    (id: NavigationPinTabId, insertIndex?: number): boolean => {
      if (pinnedTabs.includes(id)) return false;
      if (!canPinTab(pinnedTabs, id)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined,
        );
        toast.show({ label: t('navigation.dockFullToast') });
        return false;
      }
      const next = pinTab(pinnedTabs, id, insertIndex);
      void setRawPinnedTabs(next);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      return true;
    },
    [pinnedTabs, setRawPinnedTabs, t, toast],
  );

  const unpinTabFromDock = useCallback(
    (id: NavigationPinTabId): boolean => {
      if (!canUnpinTab(pinnedTabs, id)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined,
        );
        toast.show({ label: t('navigation.coreTabCannotUnpin') });
        return false;
      }
      const next = unpinTab(pinnedTabs, id);
      void setRawPinnedTabs(next);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      return true;
    },
    [pinnedTabs, setRawPinnedTabs, t, toast],
  );

  const reorderMiddleTab = useCallback(
    (id: NavigationPinTabId, targetIndex: number) => {
      const next = reorderPinnedTab(pinnedTabs, id, targetIndex);
      if (
        next.length === pinnedTabs.length &&
        next.every((item, index) => item === pinnedTabs[index])
      ) {
        return;
      }
      void setRawPinnedTabs(next);
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [pinnedTabs, setRawPinnedTabs],
  );

  const startDrag = useCallback(
    (input: { id: NavigationPinTabId; source: 'dock' | 'more'; x: number; y: number }) => {
      setPopover(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      const metrics = resolveDragMetrics(
        dockRectRef.current,
        pinnedTabs.length,
        input.source,
        input.x,
        input.y,
      );
      const next: NavDragState = {
        ...input,
        overDock: metrics.overDock,
        insertIndex: metrics.insertIndex,
        draggingOut: metrics.draggingOut && canUnpinTab(pinnedTabs, input.id),
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [pinnedTabs],
  );

  const updateDrag = useCallback(
    (x: number, y: number) => {
      const current = dragStateRef.current;
      if (!current) return;
      const metrics = resolveDragMetrics(
        dockRectRef.current,
        pinnedTabs.length,
        current.source,
        x,
        y,
      );
      const next: NavDragState = {
        ...current,
        x,
        y,
        overDock: metrics.overDock,
        insertIndex: metrics.insertIndex,
        draggingOut: metrics.draggingOut && canUnpinTab(pinnedTabs, current.id),
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [pinnedTabs],
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
      if (options?.push) {
        router.push(href);
        return;
      }
      const navigatorResult = mainNavigatorRef.current?.(id);
      if (navigatorResult === true || navigatorResult === 'handled') {
        return;
      }
      if (typeof navigatorResult === 'object' && navigatorResult.action === 'dismiss') {
        router.dismiss(navigatorResult.count);
        return;
      }
      if (navigatorResult === 'push') {
        router.push(href);
        return;
      }
      if (navigatorResult === 'replace') {
        router.replace(href);
        return;
      }
      if (id === 'chat') {
        router.navigate('/');
        return;
      }
      if (pathname === '/') {
        router.push(href);
        return;
      }
      router.replace(href);
    },
    [pathname, router],
  );

  const value = useMemo<NavigationShellContextValue>(
    () => ({
      activeDestination,
      activeDockTab,
      closePinPopover,
      dockClearance,
      dragState,
      endDrag,
      isAtRoot,
      isDockVisible,
      isFileListCollapsed,
      middleColumnWidth,
      navigateToDestination,
      openPinPopover,
      pinTabToDock,
      pinnedTabs,
      popover,
      registerDockRect,
      registerHideDock,
      registerMainNavigator,
      reorderMiddleTab,
      reportDockHeight,
      reportMiddleColumnWidth,
      restingDockHeight,
      setFileListCollapsed,
      shellMode,
      startDrag,
      toggleFileListCollapsed,
      unpinTabFromDock,
      updateDrag,
    }),
    [
      activeDestination,
      activeDockTab,
      closePinPopover,
      dockClearance,
      dragState,
      endDrag,
      isAtRoot,
      isDockVisible,
      isFileListCollapsed,
      middleColumnWidth,
      navigateToDestination,
      openPinPopover,
      pinTabToDock,
      pinnedTabs,
      popover,
      registerDockRect,
      registerHideDock,
      registerMainNavigator,
      reorderMiddleTab,
      reportDockHeight,
      reportMiddleColumnWidth,
      restingDockHeight,
      shellMode,
      startDrag,
      toggleFileListCollapsed,
      unpinTabFromDock,
      updateDrag,
    ],
  );

  return <NavigationShellContext value={value}>{children}</NavigationShellContext>;
}
