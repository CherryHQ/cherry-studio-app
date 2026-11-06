import type { FoldRegion } from './FoldRegion';

/**
 * How a side pane and the chat share their host. `paneSize` is the pane's width in a row and its
 * height in a column; the chat starts at `chatOffset` along the same axis, so a fold between
 * them stays empty.
 */
export type PaneSplit = {
  direction: 'row' | 'column';
  paneSize: number;
  chatOffset: number;
};

/**
 * A fold divides the host only when it lies inside it; Split View can leave it at a window edge.
 * The fold, in host points, is reported only while the device is partly folded; flat, the regular
 * widths apply. A fold running across the host (an upright inner display, or tabletop) stacks the
 * pane above the chat; one running down it splits the row there.
 */
export function resolvePaneSplit({
  fold,
  host,
  paneWidth,
}: {
  fold: FoldRegion | null;
  host: { width: number; height: number };
  paneWidth: number;
}): PaneSplit {
  const regular: PaneSplit = { chatOffset: paneWidth, direction: 'row', paneSize: paneWidth };
  if (!fold) return regular;

  if (isAcross(fold)) {
    const bottom = fold.y + fold.height;
    if (fold.y <= 0 || bottom >= host.height) return regular;
    return { chatOffset: bottom, direction: 'column', paneSize: fold.y };
  }

  const end = fold.x + fold.width;
  if (fold.x <= 0 || end >= host.width) return regular;
  return { chatOffset: end, direction: 'row', paneSize: fold.x };
}

/** A fold running across the window rather than down it. */
export function isAcross(fold: FoldRegion) {
  return fold.width > fold.height;
}
