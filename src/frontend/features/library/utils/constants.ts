export type FileLibraryBrowseMode = 'recent' | 'folders';

export const fileLibrarySelectionScope = 'file-library';

export const fileLibraryLayout = {
  pageEdge: 16,
  skeletonRows: 6,
} as const;

/** Keep sparse filters paging until they cover a viewport or exhaust the library. */
export const fileLibraryMinVisibleRows = 10;
