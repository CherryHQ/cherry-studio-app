import {
  computeAutoScrollDelta,
  computeDropSlotDelta,
  computeRubberBandOffset,
  computeSiblingShift,
  computeSlotMetrics,
  computeTargetIndex,
  exceedsDragSlop,
  SORTABLE_AUTO_SCROLL_EDGE,
  SORTABLE_DRAG_SLOP,
} from '../sortable-geometry';

describe('sortable geometry helpers', () => {
  test('computeRubberBandOffset passes interior offsets through and compresses bounds symmetrically', () => {
    expect(computeRubberBandOffset(40, 0, 120, 28)).toBe(40);
    expect(computeRubberBandOffset(0, 0, 120, 28)).toBe(0);
    expect(computeRubberBandOffset(120, 0, 120, 28)).toBe(120);

    const topOvershoot = computeRubberBandOffset(-28, 0, 120, 28);
    expect(topOvershoot).toBe(-14);
    expect(computeRubberBandOffset(-1000, 0, 120, 28)).toBeGreaterThan(-28);

    const bottomOvershoot = computeRubberBandOffset(148, 0, 120, 28);
    expect(bottomOvershoot).toBe(134);
    expect(computeRubberBandOffset(1000, 0, 120, 28)).toBeLessThan(148);
  });

  test('computeTargetIndex and computeDropSlotDelta handle variable item heights in both directions', () => {
    const ids = ['a', 'b', 'c'];
    const heights = new Map<string, number>([
      ['a', 50],
      ['b', 80],
      ['c', 50],
    ]);
    const metrics = computeSlotMetrics(ids, heights, 44);
    expect(metrics).toEqual({
      heights: [50, 80, 50],
      offsets: [0, 50, 130],
      totalHeight: 180,
    });

    // Drag 'a' (50px) down past 'b' (80px, midpoint at 40px -> moved 40+): hovers at index 1.
    expect(computeTargetIndex(0, 20, metrics)).toBe(0);
    expect(computeTargetIndex(0, 45, metrics)).toBe(1);
    expect(computeTargetIndex(0, -10, metrics)).toBe(0);
    // Drag 'a' all the way past 'c': index 2.
    expect(computeTargetIndex(0, 130, metrics)).toBe(2);
    // Symmetric upward drag of 'c' (50px, offset 130): crosses 'b' at 40+ and 'a' past midpoint of slot 0.
    expect(computeTargetIndex(2, -30, metrics)).toBe(2);
    expect(computeTargetIndex(2, -45, metrics)).toBe(1);
    expect(computeTargetIndex(2, -125, metrics)).toBe(0);

    // Variable height slot delta when moving 'a' (50px) to index 1 ('b' = 80px shifts up by 50 -> gap starts at 80).
    expect(computeDropSlotDelta(0, 1, metrics)).toBe(80);
    // Moving 'c' (50px, offset 130) up to index 0 (offset 0) shifts siblings down -> gap starts at 0 -> delta = -130.
    expect(computeDropSlotDelta(2, 0, metrics)).toBe(-130);
    // Same slot -> 0.
    expect(computeDropSlotDelta(1, 1, metrics)).toBe(0);
  });

  test('computeSiblingShift translates only siblings crossed between activeIndex and hoverIndex', () => {
    expect(computeSiblingShift(0, 0, 2, 48)).toBe(0);
    expect(computeSiblingShift(1, 0, 2, 48)).toBe(-48);
    expect(computeSiblingShift(2, 0, 2, 48)).toBe(-48);
    expect(computeSiblingShift(3, 0, 2, 48)).toBe(0);

    expect(computeSiblingShift(0, 2, 1, 48)).toBe(0);
    expect(computeSiblingShift(1, 2, 1, 48)).toBe(48);
    expect(computeSiblingShift(2, 2, 1, 48)).toBe(0);
  });

  test('computeAutoScrollDelta ramps smoothly in top/bottom edge zones and stays zero inside middle', () => {
    const viewportTop = 100;
    const viewportHeight = 400;

    expect(computeAutoScrollDelta(300, viewportTop, viewportHeight, 16.667)).toBe(0);
    const up = computeAutoScrollDelta(
      viewportTop + SORTABLE_AUTO_SCROLL_EDGE / 2,
      viewportTop,
      viewportHeight,
      16.667,
    );
    expect(up).toBeLessThan(0);

    const down = computeAutoScrollDelta(
      viewportTop + viewportHeight - 10,
      viewportTop,
      viewportHeight,
      16.667,
    );
    expect(down).toBeGreaterThan(0);
  });

  test('exceedsDragSlop checks radial displacement against threshold', () => {
    expect(exceedsDragSlop(0, 0)).toBe(false);
    expect(exceedsDragSlop(6, 6)).toBe(false); // 72 <= 100
    expect(exceedsDragSlop(0, SORTABLE_DRAG_SLOP + 1)).toBe(true);
    expect(exceedsDragSlop(8, 7)).toBe(true); // 113 > 100
  });
});
