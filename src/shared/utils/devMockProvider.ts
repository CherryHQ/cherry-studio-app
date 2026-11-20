export const DEV_MOCK_PROVIDER_ID = 'dev-mock';
export const DEV_MOCK_PROVIDER_NAME = 'Dev Mock Provider';
export const DEV_MOCK_MODEL_ID = 'dev-mock-chat';
export const DEV_MOCK_MODEL_NAME = 'Dev Mock Chat';
export const DEV_MOCK_UNIQUE_MODEL_ID = `${DEV_MOCK_PROVIDER_ID}::${DEV_MOCK_MODEL_ID}` as const;
export const DEV_MOCK_PROVIDER_HOST = 'https://dev-mock.local/v1';

/**
 * Strictly development-only opt-in gate for the offline deterministic Mock Provider.
 * Production bundles evaluate `__DEV__` to `false`, so this can never activate in releases.
 */
export function isDevMockProviderEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  return isDev && env.EXPO_PUBLIC_DEV_MOCK_PROVIDER === '1';
}
