/**
 * How much of the shell fits side by side in the current window. Device names never decide this:
 * an iPad in Split View, an Android tablet, and a foldable's inner display all resolve from the
 * width they actually have. A wide window keeps a left column beside one content region.
 */
export type WindowClass = 'compact' | 'wide';

/** Body text size at which the region widths below were measured. */
export const windowRegionBodyTextSize = 16;

/** Narrowest regions that stay readable at that text size, in logical points. */
export const windowRegionWidths = {
  conversationMin: 440,
  filePaneMax: 520,
  filePaneMin: 360,
  sidebar: 280,
} as const;

// The left column is widest when it holds files, so a window that fits files beside a conversation
// also fits the narrower sidebar there.
const WIDE_MIN_WIDTH = windowRegionWidths.filePaneMin + windowRegionWidths.conversationMin;

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

  return availableWidth >= WIDE_MIN_WIDTH ? 'wide' : 'compact';
}

/** The file pane takes 43% of the content width, kept between its readable bounds. */
export function resolveFilePaneWidth(contentWidth: number) {
  const { filePaneMax, filePaneMin } = windowRegionWidths;
  return Math.min(filePaneMax, Math.max(filePaneMin, Math.round(contentWidth * 0.43)));
}
