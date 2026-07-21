export const paintingQueryKeys = {
  all: () => ['/paintings'] as const,
  detail: (paintingId: string) => [`/paintings/${paintingId}`] as const,
  list: (params: { limit?: number } = {}) => ['/paintings', params] as const,
};
