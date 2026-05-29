export const assistantQueryKeys = {
  all: () => ['/assistants'] as const,
  detail: (assistantId: string) => [`/assistants/${assistantId}`] as const,
  list: (
    params: { id?: string; limit?: number; page?: number; search?: string; tagIds?: string[] } = {},
  ) => ['/assistants', params] as const,
};
