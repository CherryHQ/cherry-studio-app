import {
  createContext,
  type ContextType,
  type PropsWithChildren,
  type RefObject,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { MessageListHandle } from '@/frontend/components/Message';

import {
  ChatShareSelectionStoreContext,
  useChatShareSelectionActions,
  useChatShareSelectionState,
  useIsChatShareSelecting,
} from './chatShareSelection';

type RowRefs = Map<string, RefObject<ViewInstance | null>>;
const RowsContext = createContext<RowRefs | null>(null);
const EDGE_HEIGHT = 64;
const SCROLL_SPEED = 600;
type MeasuredRow = { id: string; top: number; bottom: number };
type SelectionActions = Pick<
  ReturnType<typeof useChatShareSelectionActions>,
  'selectMessages' | 'toggleMessage'
>;

export function useChatShareDragRow(
  id: string,
  ref: RefObject<ViewInstance | null>,
  enabled: boolean,
) {
  const rows = use(RowsContext);
  useEffect(() => {
    if (!rows || !enabled) return;
    rows.set(id, ref);
    return () => {
      rows.delete(id);
    };
  }, [enabled, id, ref, rows]);
}

/** Only the checkbox column claims a pan. Body scrolling and stationary selection stay native. */
export function ChatShareDragSelection({
  children,
  listRef,
  topInset,
  bottomInset,
}: PropsWithChildren<{
  listRef: RefObject<MessageListHandle | null>;
  topInset: number;
  bottomInset: number;
}>) {
  const isSelecting = useIsChatShareSelecting();
  const viewport = useRef<ViewInstance>(null);
  const [rows] = useState<RowRefs>(() => new Map());
  return (
    <RowsContext value={rows}>
      <View ref={viewport} className="min-h-0 flex-1" collapsable={false}>
        {children}
        {isSelecting ? (
          <SelectionColumn
            rows={rows}
            viewport={viewport}
            listRef={listRef}
            topInset={topInset}
            bottomInset={bottomInset}
          />
        ) : null}
      </View>
    </RowsContext>
  );
}

function SelectionColumn({
  rows,
  viewport,
  listRef,
  topInset,
  bottomInset,
}: {
  rows: RowRefs;
  viewport: RefObject<ViewInstance | null>;
  listRef: RefObject<MessageListHandle | null>;
  topInset: number;
  bottomInset: number;
}) {
  const { isSharing, isSelectingAll } = useChatShareSelectionState();
  const actions = useChatShareSelectionActions();
  const store = use(ChatShareSelectionStoreContext)!;
  const [controller] = useState(() =>
    createDragSelectionController(rows, viewport, listRef, store),
  );
  useEffect(() => {
    controller.configure(actions, topInset, bottomInset);
  }, [actions, bottomInset, controller, topInset]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    if (isSharing || isSelectingAll) controller.stop();
  }, [controller, isSharing, isSelectingAll]);
  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Pan()
          .enabled(!isSharing && !isSelectingAll)
          .maxPointers(1)
          .runOnJS(true)
          .onBegin(controller.begin)
          .onStart(controller.start)
          .onUpdate(controller.move)
          .onFinalize(controller.stop),
        Gesture.Tap()
          .enabled(!isSharing && !isSelectingAll)
          .runOnJS(true)
          .onEnd(controller.tap),
      ),
    [controller, isSharing, isSelectingAll],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute w-10"
        style={{ left: 14, top: topInset, bottom: bottomInset }}
      />
    </GestureDetector>
  );
}

/** Event-owned state keeps native recognizers stable while individual checkboxes update. */
function createDragSelectionController(
  rows: RowRefs,
  viewport: RefObject<ViewInstance | null>,
  listRef: RefObject<MessageListHandle | null>,
  store: NonNullable<ContextType<typeof ChatShareSelectionStoreContext>>,
) {
  let actions: SelectionActions | undefined;
  let topInset = 0,
    bottomInset = 0,
    startX = 0,
    startY = 0;
  let drag:
    | {
        y: number;
        previousY: number;
        startY: number;
        selected?: boolean;
        visited: Set<string>;
        time?: number;
      }
    | undefined;
  let frame: number | undefined;
  let active = true;
  const stop = () => {
    const wasDragging = Boolean(drag);
    drag = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (wasDragging) listRef.current?.endInteraction();
  };
  const measureRows = () =>
    Promise.all(
      [...rows].map(
        ([id, ref]) =>
          new Promise<MeasuredRow | undefined>((resolve) => {
            if (!ref.current) {
              resolve(undefined);
              return;
            }
            ref.current.measureInWindow((_x, top, _width, height) =>
              resolve(height > 0 ? { id, top, bottom: top + height } : undefined),
            );
          }),
      ),
    ).then((values) => values.filter((row): row is MeasuredRow => Boolean(row)));
  const tick = (time: number) => {
    const current = drag;
    if (!current) return;
    void measureRows().then((measured) => {
      if (drag !== current) return;
      if (current.selected === undefined) {
        const start = measured.find(
          (row) => current.startY >= row.top && current.startY <= row.bottom,
        );
        if (!start) {
          stop();
          return;
        }
        current.selected = !store.getSnapshot().has(start.id);
      }
      const low = Math.min(current.previousY, current.y),
        high = Math.max(current.previousY, current.y);
      const crossed = measured.filter(
        (row) => row.bottom >= low && row.top <= high && !current.visited.has(row.id),
      );
      crossed.forEach((row) => current.visited.add(row.id));
      if (crossed.length)
        actions?.selectMessages(
          crossed.map((row) => row.id),
          current.selected,
        );
      current.previousY = current.y;
      const elapsed =
        current.time === undefined ? 0 : Math.min(32, Math.max(0, time - current.time)) / 1000;
      current.time = time;
      viewport.current?.measureInWindow((_x, top, _width, height) => {
        if (drag !== current) return;
        const upper = top + topInset,
          lower = top + height - bottomInset;
        const direction =
          current.y < upper + EDGE_HEIGHT
            ? -Math.min(1, (upper + EDGE_HEIGHT - current.y) / EDGE_HEIGHT)
            : current.y > lower - EDGE_HEIGHT
              ? Math.min(1, (current.y - lower + EDGE_HEIGHT) / EDGE_HEIGHT)
              : 0;
        if (direction) listRef.current?.scrollBy(direction * SCROLL_SPEED * elapsed);
      });
      frame = requestAnimationFrame(tick);
    });
  };
  return {
    configure(next: SelectionActions, top: number, bottom: number) {
      actions = next;
      topInset = top;
      bottomInset = bottom;
      active = true;
    },
    begin(event: { absoluteX: number; absoluteY: number }) {
      startX = event.absoluteX;
      startY = event.absoluteY;
    },
    start(event: { absoluteX: number; absoluteY: number }) {
      // Android resets translation on activation; absolute coordinates retain the native-slop movement.
      if (Math.abs(event.absoluteX - startX) >= Math.abs(event.absoluteY - startY)) return;
      listRef.current?.beginInteraction();
      drag = { y: startY, previousY: startY, startY, visited: new Set() };
      frame = requestAnimationFrame(tick);
    },
    move(event: { absoluteY: number }) {
      if (drag) drag.y = event.absoluteY;
    },
    stop,
    dispose() {
      active = false;
      stop();
    },
    tap(event: { absoluteY: number }, success: boolean) {
      if (!success) return;
      void measureRows().then((measured) => {
        if (!active) return;
        const hit = measured.find(
          (row) => event.absoluteY >= row.top && event.absoluteY <= row.bottom,
        );
        if (hit) actions?.toggleMessage(hit.id);
      });
    },
  };
}
