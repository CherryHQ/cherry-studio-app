export const preferenceQueryKeys = {
  all: ['preferences'] as const,
  key: (key: string) => ['preferences', key] as const,
};
