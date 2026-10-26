import type { FoldRegion } from '../../../../modules/fold-region';

type Frame = { x: number; y: number; width: number; height: number };

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
 * A fold running across the window (an upright inner display, or tabletop) stacks the pane above
 * the chat whether or not the device is folded, as Apple's split containers do. A fold running
 * down the window splits the row there only while the device is partly folded; flat, the regular
 * widths apply.
 */
export function resolvePaneSplit({
  fold,
  host,
  paneWidth,
}: {
  fold: FoldRegion | null;
  host: Frame;
  paneWidth: number;
}): PaneSplit {
  const regular: PaneSplit = { chatOffset: paneWidth, direction: 'row', paneSize: paneWidth };
  if (!fold) return regular;

  if (isAcross(fold)) {
    const top = fold.y - host.y;
    const bottom = top + fold.height;
    if (top <= 0 || bottom >= host.height) return regular;
    return { chatOffset: bottom, direction: 'column', paneSize: top };
  }

  const start = fold.x - host.x;
  const end = start + fold.width;
  if (!fold.isActive || start <= 0 || end >= host.width) return regular;
  return { chatOffset: end, direction: 'row', paneSize: start };
}

/** A fold running across the window rather than down it. */
export function isAcross(fold: FoldRegion) {
  return fold.width > fold.height;
}
