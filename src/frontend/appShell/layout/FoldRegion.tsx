import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  use,
  useState,
} from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { type FoldRegionLayout, FoldRegionObserver } from '../../../../modules/fold-region';

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

/** Where the display divides the window, or null on unfolded and closed displays. */
export function useFoldRegion() {
  return useFoldRegionLayout()?.fold ?? null;
}

/** Host bounds, safe areas and fold from the same native layout observation. */
export function useFoldRegionLayout() {
  return use(FoldRegionContext);
}

/** A resized window must not expose a pane or change routes using the previous screen's fold. */
export function useIsFoldRegionLayoutCurrent() {
  const layout = useFoldRegionLayout();
  const { width, height } = useWindowDimensions();
  return !FoldRegionObserver || (layout?.window.width === width && layout.window.height === height);
}

/**
 * Reports the fold to the nearest provider. Render it once inside the region that splits, so the
 * fold is read only where a layout uses it rather than published to every screen.
 */
export function FoldRegionReporter() {
  const setLayout = use(FoldRegionSetterContext);
  if (!FoldRegionObserver || !setLayout) return null;
  return <FoldRegionObserver onLayoutChange={setLayout} style={styles.observer} />;
}

const styles = StyleSheet.create({
  observer: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
});
