export const SORTABLE_LONG_PRESS_MS = 240;
export const SORTABLE_DRAG_SLOP = 10;
export const SORTABLE_LIFT_SCALE = 1.024;
export const SORTABLE_SIBLING_DIM_OPACITY = 0.48;
export const SORTABLE_CHROME_DIM_OPACITY = 0.26;
export const SORTABLE_AUTO_SCROLL_EDGE = 56;
export const SORTABLE_AUTO_SCROLL_MAX_SPEED = 10;
export const SORTABLE_RUBBER_BAND_OVERSHOOT = 28;

export type SortableSlotMetrics = {
  heights: number[];
  offsets: number[];
  totalHeight: number;
};

/** Soft rubber-band resistance beyond `[minOffset, maxOffset]` so boundaries feel tactile. */
export function computeRubberBandOffset(
  rawOffset: number,
  minOffset: number,
  maxOffset: number,
  maxOvershoot = SORTABLE_RUBBER_BAND_OVERSHOOT,
): number {
  'worklet';
  if (maxOvershoot <= 0) {
    return Math.min(maxOffset, Math.max(minOffset, rawOffset));
  }
  if (rawOffset < minOffset) {
    const excess = minOffset - rawOffset;
    const damped = maxOvershoot * (1 - 1 / (1 + excess / maxOvershoot));
    return minOffset - damped;
  }
  if (rawOffset > maxOffset) {
    const excess = rawOffset - maxOffset;
    const damped = maxOvershoot * (1 - 1 / (1 + excess / maxOvershoot));
    return maxOffset + damped;
  }
  return rawOffset;
}

/** Build cumulative vertical offsets and heights for every item in a group. */
export function computeSlotMetrics(
  itemIds: readonly string[],
  heightsById: ReadonlyMap<string, number>,
  fallbackHeight: number,
): SortableSlotMetrics {
  const safeFallback = Math.max(1, fallbackHeight);
  const heights: number[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  for (const id of itemIds) {
    offsets.push(cursor);
    const measured = heightsById.get(id);
    const height = measured !== undefined && measured > 0 ? measured : safeFallback;
    heights.push(height);
    cursor += height;
  }

  return { heights, offsets, totalHeight: cursor };
}

/** Resolve the target slot index for `activeIndex` after moving vertically by `dragDeltaY`. */
export function computeTargetIndex(
  activeIndex: number,
  dragDeltaY: number,
  { heights, offsets }: SortableSlotMetrics,
): number {
  const count = heights.length;
  if (count <= 1 || activeIndex < 0 || activeIndex >= count) {
    return Math.max(0, Math.min(count - 1, activeIndex));
  }

  const activeHeight = heights[activeIndex];
  const activeCenter = offsets[activeIndex] + activeHeight / 2 + dragDeltaY;

  // Walk the remaining items' static intervals as displaced slots, stopping before the first
  // center-to-center swap threshold past activeCenter.
  let slotCursor = 0;
  let targetIndex = 0;
  for (let index = 0; index < count; index++) {
    if (index === activeIndex) {
      continue;
    }
    const itemHeight = heights[index];
    const swapThreshold = slotCursor + activeHeight / 2 + itemHeight / 2;
    if (activeCenter < swapThreshold) {
      return targetIndex;
    }
    slotCursor += itemHeight;
    targetIndex += 1;
  }

  return count - 1;
}

/** Vertical translation applied to an inactive sibling while `activeIndex` hovers at `hoverIndex`. */
export function computeSiblingShift(
  itemIndex: number,
  activeIndex: number,
  hoverIndex: number,
  activeHeight: number,
): number {
  'worklet';
  if (
    activeIndex < 0 ||
    hoverIndex < 0 ||
    activeIndex === hoverIndex ||
    itemIndex === activeIndex
  ) {
    return 0;
  }
  if (activeIndex < hoverIndex && itemIndex > activeIndex && itemIndex <= hoverIndex) {
    return -activeHeight;
  }
  if (activeIndex > hoverIndex && itemIndex >= hoverIndex && itemIndex < activeIndex) {
    return activeHeight;
  }
  return 0;
}

/** Group-local top offset delta from `activeIndex`'s resting position to `targetIndex`'s vacated slot. */
export function computeDropSlotDelta(
  activeIndex: number,
  targetIndex: number,
  metrics: SortableSlotMetrics,
): number {
  const { heights, offsets } = metrics;
  const count = offsets.length;
  if (
    count === 0 ||
    activeIndex < 0 ||
    activeIndex >= count ||
    targetIndex < 0 ||
    targetIndex >= count ||
    activeIndex === targetIndex
  ) {
    return 0;
  }

  const activeOffset = offsets[activeIndex];
  if (targetIndex < activeIndex) {
    return offsets[targetIndex] - activeOffset;
  }
  return offsets[targetIndex] + heights[targetIndex] - heights[activeIndex] - activeOffset;
}

/** Calculate per-frame auto-scroll step when the dragged pointer approaches the top/bottom edge. */
export function computeAutoScrollDelta(
  pointerY: number,
  viewportTop: number,
  viewportHeight: number,
  dtMs: number,
  edgeZone = SORTABLE_AUTO_SCROLL_EDGE,
  maxSpeedPerFrame = SORTABLE_AUTO_SCROLL_MAX_SPEED,
): number {
  if (viewportHeight <= 0 || edgeZone <= 0 || dtMs <= 0) {
    return 0;
  }

  const effectiveEdge = Math.min(edgeZone, viewportHeight * 0.35);
  const relativeY = pointerY - viewportTop;
  const frameScale = Math.min(3, dtMs / (1000 / 60));

  if (relativeY < effectiveEdge) {
    const intensity = Math.max(0, Math.min(1, (effectiveEdge - relativeY) / effectiveEdge));
    return -maxSpeedPerFrame * intensity * frameScale;
  }

  const distanceFromBottom = viewportHeight - relativeY;
  if (distanceFromBottom < effectiveEdge) {
    const intensity = Math.max(
      0,
      Math.min(1, (effectiveEdge - distanceFromBottom) / effectiveEdge),
    );
    return maxSpeedPerFrame * intensity * frameScale;
  }

  return 0;
}

/** True once pointer displacement breaks free of stationary long-press slop into direct drag. */
export function exceedsDragSlop(
  translationX: number,
  translationY: number,
  slop = SORTABLE_DRAG_SLOP,
): boolean {
  'worklet';
  return translationX * translationX + translationY * translationY > slop * slop;
}
