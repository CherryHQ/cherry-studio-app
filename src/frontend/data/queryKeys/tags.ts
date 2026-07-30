export const tagQueryKeys = {
  detail: (tagId: string) => [`/tags/${tagId}`] as const,
  list: () => ['/tags'] as const,
};
