export const paintingQueryKeys = {
  all: () => ['/paintings'] as const,
  allIds: () => ['/paintings', 'all-ids'] as const,
  detail: (paintingId: string) => [`/paintings/${paintingId}`] as const,
  galleryFiles: (paintingId: string) => ['painting-gallery-files', paintingId] as const,
  galleryFilesRevision: (paintingId: string, updatedAt: string) =>
    ['painting-gallery-files', paintingId, updatedAt] as const,
  imageAspectRatio: (paintingId: string, fileEntryId: string, uri: string) =>
    ['painting-image-aspect-ratio', paintingId, fileEntryId, uri] as const,
  imageAspectRatios: (paintingId: string) => ['painting-image-aspect-ratio', paintingId] as const,
  list: (params: { limit?: number } = {}) => ['/paintings', params] as const,
  resolvedFiles: (paintingId: string) => ['painting-files', paintingId] as const,
  resolvedFilesRevision: (paintingId: string, updatedAt: string) =>
    ['painting-files', paintingId, updatedAt] as const,
};
