import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type ViewInstance, View, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../../haptics';
import { duration, easing, spring } from '../../motion';
import { cn } from '../../utils';
import { MenuContent } from '../menu/menu-content';
import type { MenuAnchor, MenuItem } from '../menu/menu.types';
import { useMenuState } from '../menu/use-menu-state';
import {
  SortableContext,
  SortableGroupContext,
  type SortableActivatePayload,
  type SortableContextValue,
  type SortableGroupRegistration,
  useSortableContext,
} from './sortable-context';
import {
  computeAutoScrollDelta,
  computeDropSlotDelta,
  computeRubberBandOffset,
  computeSlotMetrics,
  computeTargetIndex,
  exceedsDragSlop,
  SORTABLE_CHROME_DIM_OPACITY,
  SORTABLE_LIFT_SCALE,
  type SortableSlotMetrics,
} from './sortable-geometry';
import type { SortableChromeProps, SortableGroupProps, SortableRootProps } from './sortable.types';

type ActiveSession = {
  activeIndex: number;
  metrics: SortableSlotMetrics;
  frameHeight: number;
  groupId: string;
  hasMovedPastSlop: boolean;
  hoverIndex: number;
  id: string;
  initialScrollOffset: number;
  isSettling: boolean;
  lastPointerY: number;
  menuItems: readonly MenuItem[];
  movable: boolean;
  phase: 'dragging' | 'lifted' | 'menu';
  rootY: number;
  rootHeight: number;
  windowAnchor: MenuAnchor;
};

type PendingCommit = {
  expectedIndex: number;
  fallbackFrame?: number;
  fallbackTimer?: ReturnType<typeof setTimeout>;
  groupCommitted: boolean;
  groupId: string;
  id: string;
  previousIds: readonly string[];
  session: ActiveSession;
};

type FloatingOverlayState = {
  height: number;
  left: number;
  node: ReactNode;
  top: number;
  width: number;
};

function measureViewInWindow(
  view: ViewInstance | null | undefined,
  fallback: { height: number; width: number },
): Promise<{ height: number; pageX: number; pageY: number; width: number }> {
  return new Promise((resolve) => {
    const measure = (
      view as unknown as {
        measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
      }
    )?.measureInWindow;

    const isUnimplementedMock =
      typeof measure === 'function' &&
      '_isMockFunction' in measure &&
      !(measure as { getMockImplementation?: () => unknown }).getMockImplementation?.();

    if (typeof measure !== 'function' || isUnimplementedMock) {
      resolve({ height: fallback.height, pageX: 0, pageY: 0, width: fallback.width });
      return;
    }

    let settled = false;
    try {
      measure.call(view, (pageX, pageY, width, height) => {
        if (settled) return;
        settled = true;
        resolve({
          height: height > 0 ? height : fallback.height,
          pageX: Number.isFinite(pageX) ? pageX : 0,
          pageY: Number.isFinite(pageY) ? pageY : 0,
          width: width > 0 ? width : fallback.width,
        });
      });
    } catch {
      if (!settled) {
        settled = true;
        resolve({ height: fallback.height, pageX: 0, pageY: 0, width: fallback.width });
      }
    }
  });
}

function getGroupHeightMap(
  allHeights: ReadonlyMap<string, number>,
  groupId: string,
  itemIds: readonly string[],
): Map<string, number> {
  const map = new Map<string, number>();
  const prefix = `${groupId}::`;
  for (const id of itemIds) {
    const height = allHeights.get(`${prefix}${id}`);
    if (height !== undefined) {
      map.set(id, height);
    }
  }
  return map;
}

/** Root overlay, gesture state, and scroll coordinator for unified long-press reordering. */
export function SortableRoot({
  children,
  onDraggingChange,
  scrollController,
  testID,
}: SortableRootProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const rootRef = useRef<ViewInstance | null>(null);
  const focusedItemRef = useRef<ViewInstance | null>(null);
  const groupsRef = useRef(new Map<string, SortableGroupRegistration>());
  const heightsRef = useRef(new Map<string, number>());
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const pendingCommitRef = useRef<PendingCommit | null>(null);
  const activationTokenRef = useRef(0);
  const autoScrollFrameRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  const isMountedRef = useRef(true);
  const isDraggingRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [floatingOverlay, setFloatingOverlay] = useState<FloatingOverlayState | null>(null);
  const [menuItems, setMenuItems] = useState<readonly MenuItem[]>([]);

  const menu = useMenuState(focusedItemRef);

  const activeIdSV = useSharedValue<string | null>(null);
  const activeGroupIdSV = useSharedValue<string | null>(null);
  const activeIndexSV = useSharedValue(-1);
  const hoverIndexSV = useSharedValue(-1);
  const activeHeightSV = useSharedValue(0);
  const dragOffsetYSV = useSharedValue(0);
  const lastSettledIdSV = useSharedValue<string | null>(null);
  const liftProgressSV = useSharedValue(0);

  const scrollControllerRef = useRef(scrollController);
  const onDraggingChangeRef = useRef(onDraggingChange);
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => {
    scrollControllerRef.current = scrollController;
    onDraggingChangeRef.current = onDraggingChange;
    reducedMotionRef.current = reducedMotion;
  }, [onDraggingChange, reducedMotion, scrollController]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== undefined) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = undefined;
    }
    lastFrameTimeRef.current = undefined;
  }, []);

  const clearPendingCommit = useCallback(() => {
    const pending = pendingCommitRef.current;
    if (!pending) return;
    if (pending.fallbackTimer !== undefined) clearTimeout(pending.fallbackTimer);
    if (pending.fallbackFrame !== undefined) cancelAnimationFrame(pending.fallbackFrame);
    pendingCommitRef.current = null;
  }, []);

  const clearSpotlightState = useCallback(() => {
    const previousActiveId = activeSessionRef.current?.id ?? activeIdSV.value;
    clearPendingCommit();
    stopAutoScroll();
    cancelAnimation(dragOffsetYSV);
    cancelAnimation(liftProgressSV);
    activeSessionRef.current = null;
    lastSettledIdSV.value = previousActiveId;
    activeIdSV.value = null;
    activeGroupIdSV.value = null;
    activeIndexSV.value = -1;
    hoverIndexSV.value = -1;
    activeHeightSV.value = 0;
    dragOffsetYSV.value = 0;
    liftProgressSV.value = 0;
    if (isMountedRef.current) {
      setFloatingOverlay(null);
    }
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      onDraggingChangeRef.current?.(false);
    }
  }, [
    activeGroupIdSV,
    activeHeightSV,
    activeIdSV,
    activeIndexSV,
    clearPendingCommit,
    dragOffsetYSV,
    hoverIndexSV,
    lastSettledIdSV,
    liftProgressSV,
    stopAutoScroll,
  ]);

  const clearSessionState = useCallback(() => {
    clearSpotlightState();
    if (isMountedRef.current) {
      setMenuItems([]);
    }
  }, [clearSpotlightState]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeSessionRef.current = null;
      clearPendingCommit();
      stopAutoScroll();
      cancelAnimation(dragOffsetYSV);
      cancelAnimation(liftProgressSV);
    };
  }, [clearPendingCommit, dragOffsetYSV, liftProgressSV, stopAutoScroll]);

  const notifyItemCommitted = useCallback(
    (groupId: string, id: string, index: number) => {
      const pending = pendingCommitRef.current;
      if (pending?.groupId === groupId && pending.id === id && pending.expectedIndex === index) {
        clearSessionState();
      }
    },
    [clearSessionState],
  );

  const registerGroup = useCallback(
    (registration: SortableGroupRegistration) => {
      groupsRef.current.set(registration.groupId, registration);
      const pending = pendingCommitRef.current;
      if (!pending || pending.groupId !== registration.groupId || pending.groupCommitted) return;

      const { itemIds } = registration;
      if (
        itemIds[pending.expectedIndex] === pending.id ||
        itemIds.length !== pending.previousIds.length ||
        itemIds.some((id, index) => id !== pending.previousIds[index])
      ) {
        pending.groupCommitted = true;
        // The moved row may be outside the virtualized window and never report its commit.
        pending.fallbackFrame = requestAnimationFrame(() => {
          if (pendingCommitRef.current?.session === pending.session) clearSessionState();
        });
      }
    },
    [clearSessionState],
  );

  const unregisterGroup = useCallback((groupId: string, token: symbol) => {
    const existing = groupsRef.current.get(groupId);
    if (existing?.token === token) {
      groupsRef.current.delete(groupId);
    }
  }, []);

  const reportItemHeight = useCallback((groupId: string, id: string, height: number) => {
    if (height > 0) {
      heightsRef.current.set(`${groupId}::${id}`, height);
    }
  }, []);

  const getGroupItemCount = useCallback(
    (groupId: string) => groupsRef.current.get(groupId)?.itemIds.length ?? 0,
    [],
  );

  const applyDragTranslation = useCallback(
    (session: ActiveSession, translationY: number) => {
      const group = groupsRef.current.get(session.groupId);
      if (!group) return;

      const scrollDelta =
        (scrollControllerRef.current?.getOffset() ?? session.initialScrollOffset) -
        session.initialScrollOffset;
      const rawContentDelta = translationY + scrollDelta;
      const groupHeights = getGroupHeightMap(heightsRef.current, session.groupId, group.itemIds);
      const metrics = computeSlotMetrics(group.itemIds, groupHeights, group.estimatedItemHeight);
      session.metrics = metrics;
      const activeOffset = metrics.offsets[session.activeIndex] ?? 0;
      const minContentDelta = -activeOffset;
      const maxContentDelta = Math.max(0, metrics.totalHeight - activeOffset - session.frameHeight);
      const clampedContentDelta = computeRubberBandOffset(
        rawContentDelta,
        minContentDelta,
        maxContentDelta,
      );
      dragOffsetYSV.value = clampedContentDelta - scrollDelta;

      const nextHover = computeTargetIndex(session.activeIndex, clampedContentDelta, metrics);
      if (nextHover !== session.hoverIndex) {
        session.hoverIndex = nextHover;
        hoverIndexSV.value = nextHover;
        haptics.selection();
      }
    },
    [dragOffsetYSV, hoverIndexSV],
  );

  const lastTranslationYRef = useRef(0);

  const startAutoScrollLoop = useCallback(() => {
    if (autoScrollFrameRef.current !== undefined || !scrollControllerRef.current) {
      return;
    }

    const tick = (now: number) => {
      const session = activeSessionRef.current;
      const scroller = scrollControllerRef.current;
      if (!session || session.phase !== 'dragging' || !scroller) {
        stopAutoScroll();
        return;
      }

      const previousTime = lastFrameTimeRef.current ?? now;
      lastFrameTimeRef.current = now;
      const dtMs = Math.max(1, now - previousTime);
      const scrollStep = computeAutoScrollDelta(
        session.lastPointerY,
        session.rootY,
        session.rootHeight,
        dtMs,
      );

      if (Math.abs(scrollStep) >= 0.25) {
        const currentOffset = scroller.getOffset();
        const nextOffset = Math.max(0, currentOffset + scrollStep);
        if (nextOffset !== currentOffset) {
          scroller.scrollTo(nextOffset, false);
          applyDragTranslation(session, lastTranslationYRef.current);
        }
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }, [applyDragTranslation, stopAutoScroll]);

  const activateLongPress = useCallback(
    (payload: SortableActivatePayload) => {
      // A settling drag owns the spotlight until the reordered list takes over.
      if (activeSessionRef.current) return;
      clearPendingCommit();
      lastSettledIdSV.value = null;

      const group = groupsRef.current.get(payload.groupId);
      const estimatedItemHeight =
        group?.estimatedItemHeight ?? payload.estimatedHeight ?? (payload.measuredHeight || 48);
      const itemIds = group?.itemIds ?? [payload.id];
      const groupHeights = getGroupHeightMap(heightsRef.current, payload.groupId, itemIds);
      const fallbackHeight = Math.max(1, payload.measuredHeight || estimatedItemHeight);
      const metrics = computeSlotMetrics(itemIds, groupHeights, fallbackHeight);
      const frameHeight = metrics.heights[payload.index] ?? fallbackHeight;

      const token = ++activationTokenRef.current;
      focusedItemRef.current = payload.view;

      // Mark session synchronously before async measureInWindow resolves so an immediate
      // pan or quick release still routes through Fork A / Fork B reliably.
      const provisionalSession: ActiveSession = {
        activeIndex: payload.index,
        metrics,
        frameHeight,
        groupId: payload.groupId,
        hasMovedPastSlop: false,
        hoverIndex: payload.index,
        id: payload.id,
        initialScrollOffset: scrollControllerRef.current?.getOffset() ?? 0,
        isSettling: false,
        lastPointerY: 0,
        menuItems: payload.menuItems,
        movable: payload.movable,
        phase: 'lifted',
        rootHeight: 0,
        rootY: 0,
        windowAnchor: {
          height: frameHeight,
          pageX: 0,
          pageY: metrics.offsets[payload.index] ?? 0,
          width: payload.measuredWidth,
        },
      };
      activeSessionRef.current = provisionalSession;
      lastTranslationYRef.current = 0;

      activeIdSV.value = payload.id;
      activeGroupIdSV.value = payload.groupId;
      activeIndexSV.value = payload.index;
      hoverIndexSV.value = payload.index;
      activeHeightSV.value = frameHeight;
      dragOffsetYSV.value = 0;
      liftProgressSV.value = reducedMotionRef.current ? 1 : withSpring(1, spring.tactile);
      haptics.light();

      void Promise.all([
        measureViewInWindow(rootRef.current, { height: 0, width: payload.measuredWidth }),
        measureViewInWindow(payload.view, {
          height: frameHeight,
          width: payload.measuredWidth,
        }),
      ]).then(([rootBox, itemBox]) => {
        if (
          !isMountedRef.current ||
          activationTokenRef.current !== token ||
          activeSessionRef.current !== provisionalSession
        ) {
          return;
        }

        const resolvedHeight = itemBox.height > 0 ? itemBox.height : frameHeight;
        provisionalSession.frameHeight = resolvedHeight;
        provisionalSession.rootY = rootBox.pageY;
        provisionalSession.rootHeight = rootBox.height;
        provisionalSession.windowAnchor = {
          height: resolvedHeight,
          pageX: itemBox.pageX,
          pageY: itemBox.pageY,
          width: itemBox.width,
        };
        activeHeightSV.value = resolvedHeight;

        setFloatingOverlay({
          height: resolvedHeight,
          left: itemBox.pageX - rootBox.pageX,
          node: payload.renderOverlay(),
          top: itemBox.pageY - rootBox.pageY,
          width: itemBox.width,
        });
      });
    },
    [
      activeGroupIdSV,
      activeHeightSV,
      activeIdSV,
      activeIndexSV,
      clearPendingCommit,
      dragOffsetYSV,
      hoverIndexSV,
      lastSettledIdSV,
      liftProgressSV,
    ],
  );

  const updateDrag = useCallback(
    (translationX: number, translationY: number, absoluteY: number) => {
      const session = activeSessionRef.current;
      if (!session || session.isSettling || session.phase === 'menu') {
        return;
      }

      lastTranslationYRef.current = translationY;
      session.lastPointerY = absoluteY;

      if (!session.hasMovedPastSlop && exceedsDragSlop(translationX, translationY)) {
        session.hasMovedPastSlop = true;
        if (session.movable) {
          session.phase = 'dragging';
          isDraggingRef.current = true;
          setIsDragging(true);
          onDraggingChangeRef.current?.(true);
          startAutoScrollLoop();
        }
      }

      if (session.phase !== 'dragging') {
        return;
      }

      applyDragTranslation(session, translationY);
    },
    [applyDragTranslation, startAutoScrollLoop],
  );

  const settleDropAndCommit = useCallback(
    (session: ActiveSession, commitReorder: boolean) => {
      session.isSettling = true;
      stopAutoScroll();

      const finalHover = commitReorder ? session.hoverIndex : session.activeIndex;
      const scrollDelta =
        (scrollControllerRef.current?.getOffset() ?? session.initialScrollOffset) -
        session.initialScrollOffset;
      const targetVisualDelta =
        computeDropSlotDelta(session.activeIndex, finalHover, session.metrics) - scrollDelta;
      const didReorder = commitReorder && finalHover !== session.activeIndex;

      if (commitReorder) {
        haptics.light();
      }

      const finalize = () => {
        if (activeSessionRef.current !== session) return;
        const group = groupsRef.current.get(session.groupId);
        if (!didReorder || !group) {
          clearSessionState();
          return;
        }

        pendingCommitRef.current = {
          expectedIndex: finalHover,
          fallbackTimer: setTimeout(() => {
            if (pendingCommitRef.current?.session === session) clearSessionState();
          }, 400),
          groupCommitted: false,
          groupId: session.groupId,
          id: session.id,
          previousIds: [...group.itemIds],
          session,
        };
        group.onReorder({
          fromIndex: session.activeIndex,
          groupId: session.groupId,
          id: session.id,
          toIndex: finalHover,
        });
      };

      if (reducedMotionRef.current) {
        dragOffsetYSV.value = targetVisualDelta;
        liftProgressSV.value = 0;
        finalize();
        return;
      }

      const dropTiming = { duration: duration.instant, easing: easing.settle };
      dragOffsetYSV.value = withTiming(targetVisualDelta, dropTiming);
      liftProgressSV.value = withTiming(0, dropTiming, (finished) => {
        if (finished) runOnJS(finalize)();
      });
    },
    [clearSessionState, dragOffsetYSV, liftProgressSV, stopAutoScroll],
  );

  const finishGesture = useCallback(
    (success: boolean) => {
      const session = activeSessionRef.current;
      if (!session || session.isSettling || session.phase === 'menu') {
        return;
      }

      if (session.phase === 'lifted') {
        const canOpenMenu = success && !session.hasMovedPastSlop && session.menuItems.length > 0;
        if (canOpenMenu) {
          session.phase = 'menu';
          setMenuItems(session.menuItems);
          liftProgressSV.value = reducedMotionRef.current
            ? 0
            : withTiming(0, { duration: duration.fast, easing: easing.settle });
          menu.open(session.windowAnchor);
          return;
        }

        settleDropAndCommit(session, false);
        return;
      }

      settleDropAndCommit(session, success);
    },
    [liftProgressSV, menu, settleDropAndCommit],
  );

  const handleMenuClose = useCallback(
    (afterClose?: () => void) => {
      menu.close(afterClose);
      if (activeSessionRef.current?.phase === 'menu') {
        clearSpotlightState();
      }
    },
    [clearSpotlightState, menu],
  );

  const handleMenuClosed = useCallback(() => {
    menu.finishClose();
    if (isMountedRef.current) {
      setMenuItems([]);
    }
    if (activeSessionRef.current?.phase === 'menu') {
      clearSpotlightState();
    }
  }, [clearSpotlightState, menu]);

  const commitAccessibilityMove = useCallback(
    (groupId: string, id: string, fromIndex: number, toIndex: number) => {
      const group = groupsRef.current.get(groupId);
      if (!group || toIndex < 0 || toIndex >= group.itemIds.length || fromIndex === toIndex) {
        return;
      }
      group.onReorder({ fromIndex, groupId, id, toIndex });
    },
    [],
  );

  const contextValue = useMemo<SortableContextValue>(
    () => ({
      activateLongPress,
      activeGroupIdSV,
      activeHeightSV,
      activeIdSV,
      activeIndexSV,
      commitAccessibilityMove,
      dragOffsetYSV,
      finishGesture,
      getGroupItemCount,
      hoverIndexSV,
      lastSettledIdSV,
      liftProgressSV,
      notifyItemCommitted,
      registerGroup,
      reportItemHeight,
      unregisterGroup,
      updateDrag,
    }),
    [
      activateLongPress,
      activeGroupIdSV,
      activeHeightSV,
      activeIdSV,
      activeIndexSV,
      commitAccessibilityMove,
      dragOffsetYSV,
      finishGesture,
      getGroupItemCount,
      hoverIndexSV,
      lastSettledIdSV,
      liftProgressSV,
      notifyItemCommitted,
      registerGroup,
      reportItemHeight,
      unregisterGroup,
      updateDrag,
    ],
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const scale = reducedMotion
      ? 1
      : 1 + (SORTABLE_LIFT_SCALE - 1) * Math.max(0, Math.min(1, liftProgressSV.value));
    return {
      transform: [{ translateY: dragOffsetYSV.value }, { scale }],
    };
  }, [reducedMotion]);

  return (
    <SortableContext value={contextValue}>
      <View collapsable={false} ref={rootRef} style={styles.root} testID={testID}>
        {typeof children === 'function' ? children({ isDragging }) : children}

        {floatingOverlay ? (
          <Animated.View
            accessibilityElementsHidden
            className="rounded-2xl bg-card shadow-xl shadow-constant-black/15 dark:shadow-constant-black/50"
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
              styles.overlay,
              overlayAnimatedStyle,
              {
                height: floatingOverlay.height,
                left: floatingOverlay.left,
                top: floatingOverlay.top,
                width: floatingOverlay.width,
              },
            ]}
            testID={testID ? `${testID}-overlay` : 'sortable-overlay'}
          >
            <View className="overflow-hidden rounded-2xl" style={styles.overlayClip}>
              {floatingOverlay.node}
            </View>
            <View
              className="absolute inset-0 rounded-2xl border border-border"
              pointerEvents="none"
              style={styles.overlayBorder}
            />
          </Animated.View>
        ) : null}

        {menu.anchor ? (
          <MenuContent
            anchor={menu.anchor}
            isOpen={menu.isOpen}
            items={menuItems}
            onClose={handleMenuClose}
            onClosed={handleMenuClosed}
          />
        ) : null}
      </View>
    </SortableContext>
  );
}

/** Registers an ordered group with `Sortable.Root` and optionally wraps its rows. */
export function SortableGroup({
  children,
  estimatedItemHeight,
  groupId,
  itemIds,
  onReorder,
}: SortableGroupProps) {
  const sortable = useSortableContext();
  const [token] = useState(() => Symbol(groupId));
  const groupContextValue = useMemo(
    () => ({ groupId, groupSize: itemIds.length }),
    [groupId, itemIds.length],
  );

  useLayoutEffect(() => {
    if (!sortable) return;
    sortable.registerGroup({ estimatedItemHeight, groupId, itemIds, onReorder, token });
    return () => sortable.unregisterGroup(groupId, token);
  }, [estimatedItemHeight, groupId, itemIds, onReorder, sortable, token]);

  if (children === undefined || children === null) {
    return null;
  }

  return <SortableGroupContext value={groupContextValue}>{children}</SortableGroupContext>;
}

/** Dims non-row section headers or auxiliary chrome while a sortable item is active. */
export function SortableChrome({ children, className, testID }: SortableChromeProps) {
  const sortable = useSortableContext();
  const reducedMotion = useReducedMotion() ?? false;

  const animatedStyle = useAnimatedStyle(() => {
    if (!sortable) return { opacity: 1 };
    const targetOpacity = sortable.activeGroupIdSV.value !== null ? SORTABLE_CHROME_DIM_OPACITY : 1;
    return {
      opacity: reducedMotion
        ? targetOpacity
        : withTiming(targetOpacity, { duration: duration.fast, easing: easing.settle }),
    };
  }, [reducedMotion, sortable]);

  return (
    <Animated.View className={cn(className)} style={animatedStyle} testID={testID}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    borderCurve: 'continuous',
    position: 'absolute',
    zIndex: 40,
  },
  overlayBorder: {
    borderCurve: 'continuous',
  },
  overlayClip: {
    borderCurve: 'continuous',
    height: '100%',
    width: '100%',
  },
  root: {
    flex: 1,
    position: 'relative',
  },
});
