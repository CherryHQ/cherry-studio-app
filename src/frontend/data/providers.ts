export const providerQueryKeys = {
  apiKeys: (providerId: string, params: { enabled?: boolean } = {}) =>
    [`/providers/${providerId}/api-keys`, params] as const,
  authConfig: (providerId: string) => [`/providers/${providerId}/auth-config`] as const,
  detail: (providerId: string) => [`/providers/${providerId}`] as const,
  list: (params: { enabled?: boolean } = {}) => ['/providers', params] as const,
};
