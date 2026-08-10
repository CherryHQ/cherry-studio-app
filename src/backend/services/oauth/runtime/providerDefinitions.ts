import { createCherryInOAuthProvider } from './providers/cherryin';
import type { OAuthRuntimeProviderDefinition } from './types';

export function createOAuthProviderDefinitions(
  fetch: typeof globalThis.fetch,
): Record<string, OAuthRuntimeProviderDefinition> {
  const cherryin = createCherryInOAuthProvider(fetch);
  return { [cherryin.providerId]: cherryin };
}
