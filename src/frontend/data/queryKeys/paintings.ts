export const paintingQueryKeys = {
  /** Matches every `/painting-boards` Data API query: the gallery, board rows, and their paintings. */
  isBoardQuery: (queryKey: readonly unknown[]) =>
    typeof queryKey[0] === 'string' &&
    (queryKey[0] === '/painting-boards' || queryKey[0].startsWith('/painting-boards/')),
  detail: (paintingId: string) => [`/paintings/${paintingId}`] as const,
  imageAspectRatio: (paintingId: string, fileEntryId: string, uri: string) =>
    ['painting-image-aspect-ratio', paintingId, fileEntryId, uri] as const,
  imageAspectRatios: (paintingId: string) => ['painting-image-aspect-ratio', paintingId] as const,
  resolvedFiles: (paintingId: string) => ['painting-files', paintingId] as const,
  resolvedFilesRevision: (paintingId: string, updatedAt: string) =>
    ['painting-files', paintingId, updatedAt] as const,
};
