export const modelQueryKeys = {
  detail: (modelId: string) => [`/models/${modelId}`] as const,
  list: (params: { capability?: string; enabled?: boolean; providerId?: string } = {}) =>
    ['/models', params] as const,
};
