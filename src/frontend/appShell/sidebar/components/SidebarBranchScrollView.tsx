import {
  createContext,
  type RefObject,
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import type { ScrollViewInstance, ScrollViewProps, ViewInstance } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getSidebarBranchOffset, type SidebarBranchRowLayout } from './sidebarBranchLayout';

type RowRegistration = {
  ref: RefObject<ViewInstance | null>;
  depth: number;
};
const BranchViewportContext = createContext<{
  offset: SharedValue<number>;
  register(id: string, ref: RefObject<ViewInstance | null>, depth: number): () => void;
  refresh(): void;
  setDisclosureAnimating(animating: boolean): void;
} | null>(null);

/** One vertical scroll owner; horizontal movement is a derived transform, never a pan gesture. */
export function SidebarBranchScrollView({
  topInset,
  onEndReached,
  children,
  ...props
}: Omit<ScrollViewProps, 'onScroll' | 'onContentSizeChange' | 'scrollEventThrottle'> & {
  topInset: number;
  onEndReached(): void;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const registrations = useRef(new Map<string, RowRegistration>());
  const generation = useRef(0);
  const active = useRef(true);
  const activeTransitions = useRef(0);
  const measureTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rows = useSharedValue<SidebarBranchRowLayout[]>([]);
  const scrollY = useSharedValue(0);
  const nearEnd = useSharedValue(false);
  const offset = useDerivedValue(() =>
    getSidebarBranchOffset(rows.get(), scrollY.get() + topInset),
  );

  const refresh = useCallback(() => {
    if (!active.current || activeTransitions.current > 0) return;
    generation.current++;
    clearTimeout(measureTimer.current);
    if (!registrations.current.size) return;
    // During a reveal, sibling positions change every frame. Measure once the layout settles.
    measureTimer.current = setTimeout(() => {
      measureTimer.current = undefined;
      const content = scrollRef.current?.getInnerViewRef();
      if (!content) return;
      const currentGeneration = generation.current;
      const entries = [...registrations.current.entries()];
      const measured: SidebarBranchRowLayout[] = [];
      let remaining = entries.length;
      const finish = () => {
        remaining--;
        if (!remaining && active.current && generation.current === currentGeneration)
          rows.set(measured.sort((left, right) => left.top - right.top));
      };
      for (const [id, entry] of entries) {
        const view = entry.ref.current;
        if (!view) {
          finish();
          continue;
        }
        // Measure in content coordinates; never combine an old window measurement with new scrollY.
        view.measureLayout(
          content,
          (_left, top, _width, height) => {
            if (registrations.current.get(id) === entry && height > 0)
              measured.push({ top, height, depth: entry.depth });
            finish();
          },
          finish,
        );
      }
    }, 32);
  }, [rows]);
  const setDisclosureAnimating = useCallback(
    (animating: boolean) => {
      if (animating) {
        activeTransitions.current++;
        generation.current++;
        clearTimeout(measureTimer.current);
        measureTimer.current = undefined;
        return;
      }
      if (!activeTransitions.current) return;
      activeTransitions.current--;
      if (activeTransitions.current === 0) refresh();
    },
    [refresh],
  );
  const register = useCallback(
    (id: string, ref: RefObject<ViewInstance | null>, depth: number) => {
      const entry = { ref, depth };
      registrations.current.set(id, entry);
      refresh();
      return () => {
        if (registrations.current.get(id) !== entry) return;
        registrations.current.delete(id);
        if (!registrations.current.size) rows.set([]);
        refresh();
      };
    },
    [refresh, rows],
  );
  useLayoutEffect(() => {
    const registeredRows = registrations.current;
    active.current = true;
    refresh();
    return () => {
      active.current = false;
      activeTransitions.current = 0;
      clearTimeout(measureTimer.current);
      measureTimer.current = undefined;
      registeredRows.clear();
    };
  }, [refresh]);
  const handleScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
    nearEnd.set(
      event.contentSize.height - event.layoutMeasurement.height - event.contentOffset.y <= 24,
    );
  });
  useAnimatedReaction(
    () => nearEnd.get(),
    (current, previous) => {
      if (current && !previous) scheduleOnRN(onEndReached);
    },
  );
  const viewport = useMemo(
    () => ({ offset, register, refresh, setDisclosureAnimating }),
    [offset, register, refresh, setDisclosureAnimating],
  );

  return (
    <BranchViewportContext value={viewport}>
      <Animated.ScrollView
        {...props}
        ref={scrollRef}
        onContentSizeChange={refresh}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {children}
      </Animated.ScrollView>
    </BranchViewportContext>
  );
}

/** Parent groups can move a whole set of rows without changing each row's local layout. */
export function useSidebarBranchLayoutRefresh() {
  return use(BranchViewportContext)?.refresh;
}

/** Suppresses intermediate row measurement while a disclosure height transition is running. */
export function useSidebarBranchTransition() {
  return use(BranchViewportContext)?.setDisclosureAnimating;
}

export function useSidebarBranchRow(depth: number) {
  const viewport = use(BranchViewportContext);
  const ref = useRef<ViewInstance>(null);
  const id = useId();
  const register = viewport?.register;
  useLayoutEffect(() => register?.(id, ref, depth), [depth, id, register]);
  return { ref, viewport };
}
