export const topicQueryKeys = {
  all: () => ['/topics'] as const,
  list: (params: { cursor?: string; limit?: number; q?: string } = {}) =>
    ['/topics', params] as const,
  detail: (topicId: string) => [`/topics/${topicId}`] as const,
};
