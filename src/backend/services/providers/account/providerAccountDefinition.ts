import type {
  ProviderAccountBalance,
  ProviderAccountCapabilities,
} from '@/shared/contracts/providerAccounts';

import type { ProviderOauthApplication, ProviderOauthClient } from './providerOauth';

/** Vendor behavior only. The runtime owns attempts, stored grants, refresh and logout ordering. */
export type ProviderAccountDefinition = {
  /** Registry preset identity; installed copies resolve through presetProviderId. */
  id: string;
  oauth: ProviderOauthClient;
  getApplication(): ProviderOauthApplication;
  getApiKeys?(token: string, signal: AbortSignal): Promise<string[]>;
  getBalance?(token: string, signal: AbortSignal): Promise<ProviderAccountBalance>;
  getProfile?(
    token: string,
    signal: AbortSignal,
  ): Promise<{ displayName: string | null; email: string | null }>;
};

export function getAccountCapabilities(
  definition: ProviderAccountDefinition | undefined,
): ProviderAccountCapabilities {
  return {
    signIn: !!definition,
    apiKeys: !!definition?.getApiKeys,
    balance: !!definition?.getBalance,
  };
}
