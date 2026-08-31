/** Grid geometry and paging thresholds shared by the library's screen parts. */
export const fileLibraryGrid = {
  columns: 2,
  pageEdge: 16, // page margin outside the outermost tiles
  skeletonTiles: 6, // placeholder tiles shown while a page is in flight
  tileGap: 12, // gap between tiles, horizontally and vertically
  tileProvenanceHeight: 16, // origin badge line, reserved whether or not it fills
  tileMetadataEstimatedHeight: 46, // preview gap, filename, and the badge line
} as const;

/**
 * Tiles a kind tab pulls pages for before it stops filling itself: enough to
 * cover a screen, so a sparse kind is not a near-empty grid with nothing to
 * scroll.
 */
export const fileLibraryMinVisibleTiles = 10;
