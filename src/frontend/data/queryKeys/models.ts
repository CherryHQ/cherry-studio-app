export const modelQueryKeys = {
  setup: (providerId: string) => ['onboarding-models', providerId] as const,
  detail: (modelId: string) => [`/models/${modelId}`] as const,
  list: (
    params: {
      capability?: string;
      enabled?: boolean;
      isSystemSupported?: boolean;
      providerId?: string;
    } = {},
  ) => ['/models', params] as const,
};
