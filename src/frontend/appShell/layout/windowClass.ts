/**
 * How much of the shell fits side by side in the current window. Device names never decide this:
 * an iPad in Split View, an Android tablet, and a foldable's inner display all resolve from the
 * width they actually have.
 */
export type WindowClass = 'compact' | 'medium' | 'expanded';

/** Body text size at which the region widths below were measured. */
export const windowRegionBodyTextSize = 16;

/** Narrowest regions that stay readable at that text size, in logical points. */
export const windowRegionWidths = {
  conversationMin: 440,
  filePaneMin: 360,
  sidebar: 280,
} as const;

// A file pane beside a conversation is the widest arrangement the content needs; the persistent
// sidebar then adds its own column.
const MEDIUM_MIN_WIDTH = windowRegionWidths.filePaneMin + windowRegionWidths.conversationMin;
const EXPANDED_MIN_WIDTH = MEDIUM_MIN_WIDTH + windowRegionWidths.sidebar;

type WindowClassInput = {
  width: number;
  /** Leading and trailing safe areas are independent; foldables do not keep them equal. */
  insetLeft: number;
  insetRight: number;
  /** Rendered text size relative to the base size. Larger text needs wider regions. */
  textScale: number;
};

export function resolveWindowClass({
  width,
  insetLeft,
  insetRight,
  textScale,
}: WindowClassInput): WindowClass {
  const availableWidth = (width - insetLeft - insetRight) / Math.max(1, textScale);

  if (availableWidth >= EXPANDED_MIN_WIDTH) return 'expanded';
  if (availableWidth >= MEDIUM_MIN_WIDTH) return 'medium';
  return 'compact';
}
