import type { ApiKeyEntry, AuthConfig } from '@cherrystudio/universal/data/types/provider';

import { providerService } from '@/backend/data/services/ProviderService';

import type { OAuthRuntimeProviderRepository } from './runtime/OAuthRuntimeService';
import type { OAuthTokenStoreProviderRepository } from './runtime/OAuthTokenStore';

/**
 * The four provider-row calls this module makes, bound to the data service.
 *
 * Desktop's stores reach `providerService` directly and take no constructor
 * argument; this is the same move. It stays a narrow object rather than the DAO
 * itself because mobile split the repository contract in two — the runtime side
 * needs API keys, the token store needs `authConfig` — and every adapter is
 * written against those four calls, which is the seam tests substitute.
 */
export const oauthProviderRepository: OAuthRuntimeProviderRepository &
  OAuthTokenStoreProviderRepository = {
  getAuthConfig: (providerId: string): Promise<AuthConfig | null> =>
    providerService.getAuthConfig(providerId),
  listApiKeys: (providerId: string): Promise<{ keys: ApiKeyEntry[] }> =>
    providerService.listApiKeys(providerId),
  replaceApiKeys: (providerId: string, apiKeys: ApiKeyEntry[]): Promise<unknown> =>
    providerService.replaceApiKeys(providerId, apiKeys),
  update: (
    providerId: string,
    input: { authConfig?: AuthConfig; isEnabled?: boolean },
  ): Promise<unknown> => providerService.update(providerId, input),
};
