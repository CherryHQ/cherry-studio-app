export const messageQueryKeys = {
  topic: (topicId: string, pageSize: { initial: number; older: number }) =>
    [`/topics/${topicId}/messages`, { pageSize }] as const,
};
