import type { ChatArtifactsHandleDock } from '@/shared/data/cache/cacheSchemas';

export const DEFAULT_HANDLE_DOCK = {
  side: 'right',
  yRatio: 0.24,
} as const satisfies NonNullable<ChatArtifactsHandleDock>;

export const HANDLE_WIDTH = 44;
export const HANDLE_HEIGHT = 56;
const SNAP_PROJECTION_SECONDS = 0.16;
const POPOVER_EDGE_INSET = 12;
const POPOVER_WIDTH = 280;

type DockSide = NonNullable<ChatArtifactsHandleDock>['side'];

export function clampHandleY(y: number, minY: number, maxY: number) {
  'worklet';
  return Math.max(minY, Math.min(y, maxY));
}

export function yToRatio(y: number, minY: number, maxY: number) {
  'worklet';
  if (maxY <= minY) return 0;
  return (clampHandleY(y, minY, maxY) - minY) / (maxY - minY);
}

export function ratioToY(yRatio: number, minY: number, maxY: number) {
  'worklet';
  return minY + clampHandleY(yRatio, 0, 1) * Math.max(0, maxY - minY);
}

export function resolveSnapSide(centerX: number, velocityX: number, width: number): DockSide {
  'worklet';
  return centerX + velocityX * SNAP_PROJECTION_SECONDS < width / 2 ? 'left' : 'right';
}

export function avoidTurnDirectoryY(y: number, railCenter: number, minY: number, maxY: number) {
  'worklet';
  // Seven ticks, vertical padding and hit slop occupy up to 42 points on each side.
  const before = railCenter - 42 - HANDLE_HEIGHT;
  const after = railCenter + 42;
  if (y <= before || y >= after) return y;
  if (before >= minY && (after > maxY || y - before <= after - y)) return before;
  if (after <= maxY) return after;
  return y;
}

export function resolvePopoverPosition({
  side,
  handleY,
  containerWidth,
  minY,
  maxY,
  popoverHeight,
}: {
  side: DockSide;
  handleY: number;
  containerWidth: number;
  minY: number;
  maxY: number;
  popoverHeight: number;
}) {
  'worklet';
  const inset = Math.min(POPOVER_EDGE_INSET, containerWidth / 2);
  const width = Math.min(POPOVER_WIDTH, containerWidth - inset * 2);
  const maxHeight = Math.max(0, maxY - minY);
  return {
    left: side === 'left' ? inset : containerWidth - inset - width,
    top: clampHandleY(handleY, minY, maxY - Math.min(maxHeight, popoverHeight)),
    width,
    maxHeight,
  };
}
