import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  use,
  useLayoutEffect,
  useState,
} from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  type ReservedRegionFrame,
  ReservedRegionsProvider,
  useReservedRegions,
  useReservedRegionsReady,
} from 'react-native-reserved-regions';

/** Where the display divides a host while the device is partly folded, in host points. */
export type FoldRegion = ReservedRegionFrame;

type Size = { width: number; height: number };

/** One observation of a host: its size, the window it was taken in, and the fold dividing it. */
export type FoldRegionLayout = {
  host: Size;
  window: Size;
  fold: FoldRegion | null;
};

type LayoutChangeHandler = (layout: FoldRegionLayout) => void;

const FoldRegionContext = createContext<FoldRegionLayout | null>(null);
const FoldRegionSetterContext = createContext<Dispatch<
  SetStateAction<FoldRegionLayout | null>
> | null>(null);

/** Shares one snapshot of the host and fold inside the layout that splits around it. */
export function FoldRegionProvider({ children }: PropsWithChildren) {
  const [layout, setLayout] = useState<FoldRegionLayout | null>(null);
  return (
    <FoldRegionSetterContext value={setLayout}>
      <FoldRegionContext value={layout}>{children}</FoldRegionContext>
    </FoldRegionSetterContext>
  );
}

/** Where the display divides the split host, or null on flat, unfolded and closed displays. */
export function useFoldRegion() {
  return useFoldRegionLayout()?.fold ?? null;
}

/** Host size and fold from the same observation. */
export function useFoldRegionLayout() {
  return use(FoldRegionContext);
}

/** A resized window must not expose a pane or change routes using the previous screen's fold. */
export function useIsFoldRegionLayoutCurrent() {
  return isCurrent(useFoldRegionLayout(), useWindowDimensions());
}

/**
 * Reports the fold to the nearest provider. Render it once inside the region that splits, so the
 * fold is read only where a layout uses it rather than published to every screen.
 */
export function FoldRegionReporter() {
  const setLayout = use(FoldRegionSetterContext);
  return setLayout ? <FoldRegionObserver onLayoutChange={setLayout} /> : null;
}

const WindowFoldRegionContext = createContext<FoldRegionLayout | null>(null);

/**
 * Observes the fold across the whole window for layouts that place regions around it, such as the
 * sidebar column. The split reporter cannot serve them: it only sees a fold inside its own host,
 * so a column that grows to the fold would push the host past it and lose the fold it sized to.
 * Rendered at the window's origin, its host coordinates are window coordinates.
 */
export function WindowFoldRegion({ children }: PropsWithChildren) {
  const [layout, setLayout] = useState<FoldRegionLayout | null>(null);
  return (
    <WindowFoldRegionContext value={layout}>
      <FoldRegionObserver onLayoutChange={setLayout} />
      {children}
    </WindowFoldRegionContext>
  );
}

/** The fold across the window from a current snapshot, or null. */
export function useWindowFoldRegion() {
  const layout = use(WindowFoldRegionContext);
  return isCurrent(layout, useWindowDimensions()) ? (layout?.fold ?? null) : null;
}

function isCurrent(layout: FoldRegionLayout | null, window: Size) {
  return layout?.window.width === window.width && layout.window.height === window.height;
}

/**
 * An invisible view filling its host. It remounts for each window size, so a resized window is
 * reported afresh rather than with the previous screen's regions.
 */
function FoldRegionObserver({ onLayoutChange }: { onLayoutChange: LayoutChangeHandler }) {
  const { width, height } = useWindowDimensions();
  return (
    <FoldRegionWindowObserver
      key={`${width}x${height}`}
      onLayoutChange={onLayoutChange}
      windowHeight={height}
      windowWidth={width}
    />
  );
}

function FoldRegionWindowObserver({
  onLayoutChange,
  windowHeight,
  windowWidth,
}: {
  onLayoutChange: LayoutChangeHandler;
  windowHeight: number;
  windowWidth: number;
}) {
  const [host, setHost] = useState<Size | null>(null);
  return (
    <ReservedRegionsProvider
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setHost((current) =>
          current?.width === width && current.height === height ? current : { width, height },
        );
      }}
      style={styles.observer}
    >
      {host ? (
        <FoldRegionReader
          host={host}
          onLayoutChange={onLayoutChange}
          windowHeight={windowHeight}
          windowWidth={windowWidth}
        />
      ) : null}
    </ReservedRegionsProvider>
  );
}

/** Reports once the regions are measured; only a partly folded device has a division. */
function FoldRegionReader({
  host,
  onLayoutChange,
  windowHeight,
  windowWidth,
}: {
  host: Size;
  onLayoutChange: LayoutChangeHandler;
  windowHeight: number;
  windowWidth: number;
}) {
  const isReady = useReservedRegionsReady();
  const regions = useReservedRegions();
  const fold = regions.find((region) => region.kind === 'division')?.frame ?? null;
  // Before paint, so the first frame in a new window already lays out around its fold.
  useLayoutEffect(() => {
    if (!isReady) return;
    onLayoutChange({ fold, host, window: { height: windowHeight, width: windowWidth } });
  }, [fold, host, isReady, onLayoutChange, windowHeight, windowWidth]);
  return null;
}

const styles = StyleSheet.create({
  observer: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
});
