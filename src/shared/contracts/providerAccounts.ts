import type { Provider } from '@/shared/data/types/provider';

export type ProviderAccountIdentity = Pick<Provider, 'id' | 'presetProviderId'>;

/** Mobile capabilities supplied by the registered adapter, independent of the upstream catalog. */
export type ProviderAccountCapabilities = {
  signIn: boolean;
  apiKeys: boolean;
  balance: boolean;
  flow?: 'interactive';
  enterpriseDomain?: boolean;
};

/** Credential-free interaction data; vendor protocol types stay inside the backend. */
export type ProviderSignInEvent =
  | { type: 'device-code'; code: string; url: string }
  | { type: 'browser'; url: string }
  | { type: 'progress' };
export type ProviderSignInPrompt = {
  type: 'enterprise-domain' | 'authorization-code';
  signal?: AbortSignal;
};
export type ProviderSignInInteraction = {
  signal: AbortSignal;
  notify(event: ProviderSignInEvent): void;
  prompt(prompt: ProviderSignInPrompt): Promise<string>;
};

export type ProviderAccountErrorReason =
  | 'unsupported'
  | 'cancelled'
  | 'configuration'
  | 'authorization'
  | 'callback'
  | 'network'
  | 'request'
  | 'storage'
  | 'no-keys';

export class ProviderAccountError extends Error {
  constructor(readonly reason: ProviderAccountErrorReason) {
    super(`Provider account operation failed: ${reason}`);
    this.name = 'ProviderAccountError';
  }
}

export type ProviderAccountBalance = { amount: number; currency: string };
export type ProviderAccountStatus = {
  signedIn: boolean;
  balance: ProviderAccountBalance | null;
  displayName: string | null;
  email: string | null;
  updatedAt: number | null;
};

export type ProviderAuthorizationRequest = {
  attemptId: string;
  authorizationUrl: string;
  redirectUrl: string;
};

export interface ProviderAccountsModule {
  getCapabilities(provider: ProviderAccountIdentity): ProviderAccountCapabilities;
  getStatus(providerId: string): Promise<ProviderAccountStatus>;
  begin(providerId: string): Promise<ProviderAuthorizationRequest>;
  signIn(providerId: string, interaction: ProviderSignInInteraction): Promise<void>;
  cancel(attemptId: string): Promise<void>;
  receiveRedirect(url: string): Promise<string | null>;
  refresh(providerId: string): Promise<ProviderAccountStatus>;
  logout(providerId: string): Promise<void>;
}
