export const messageQueryKeys = {
  topic: (topicId: string, options: { limit: number }) =>
    [`/topics/${topicId}/messages`, options] as const,
};
