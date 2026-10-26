import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  use,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';

import { type FoldRegion, FoldRegionObserver } from '../../../../modules/fold-region';

const FoldRegionContext = createContext<FoldRegion | null>(null);
const FoldRegionSetterContext = createContext<Dispatch<SetStateAction<FoldRegion | null>> | null>(
  null,
);

/** Shares the fold reported inside the layout that splits around it. */
export function FoldRegionProvider({ children }: PropsWithChildren) {
  const [fold, setFold] = useState<FoldRegion | null>(null);
  return (
    <FoldRegionSetterContext value={setFold}>
      <FoldRegionContext value={fold}>{children}</FoldRegionContext>
    </FoldRegionSetterContext>
  );
}

/** Where the display divides the window, or null on unfolded and closed displays. */
export function useFoldRegion() {
  return use(FoldRegionContext);
}

/**
 * Reports the fold to the nearest provider. Render it once inside the region that splits, so the
 * fold is read only where a layout uses it rather than published to every screen.
 */
export function FoldRegionReporter() {
  const setFold = use(FoldRegionSetterContext);
  if (!FoldRegionObserver || !setFold) return null;
  return <FoldRegionObserver onFoldChange={setFold} style={styles.observer} />;
}

const styles = StyleSheet.create({
  observer: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
});
