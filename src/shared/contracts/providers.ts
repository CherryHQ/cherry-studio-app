import type { Provider } from '@/shared/data/types/provider';

export type CompleteCherryInOAuthInput = {
  apiHost: string;
  code: string;
  codeVerifier: string;
  oauthServer: string;
  redirectUri: string;
};

export type CherryInProfile = {
  displayName: string | null;
  email: string | null;
  group: string | null;
  username: string | null;
};

export type CherryInAccount = {
  balance: number;
  monthlySpend: number | null;
  monthlyUsageTokens: number | null;
  profile: CherryInProfile | null;
};

export interface ProvidersBackend {
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
  completeCherryInOAuth(input: CompleteCherryInOAuthInput): Promise<void>;
  getCherryInAccount(apiHost: string): Promise<CherryInAccount | null>;
  logoutCherryIn(apiHost: string): Promise<void>;
  persistAvatar(id: string, sourceUri: string): Promise<string>;
  resolveAvatar(id: string): string | undefined;
}
