// Invalidation keys are prefixes, not exact keys: `['/providers']` reaches the list however
// it was queried. Appending an empty params object (`['/providers', {}]`) instead matches
// nothing, because `buildQueryKey` drops empty query objects from the key it stores.
export const providerQueryKeys = {
  apiKeys: (providerId: string) => [`/providers/${providerId}/api-keys`] as const,
  authConfig: (providerId: string) => [`/providers/${providerId}/auth`] as const,
  catalog: () => ['providers', 'catalog'] as const,
  detail: (providerId: string) => [`/providers/${providerId}`] as const,
  list: () => ['/providers'] as const,
  page: () => ['/providers/page'] as const,
  registryUpdate: () => ['providers', 'registry-update'] as const,
};
