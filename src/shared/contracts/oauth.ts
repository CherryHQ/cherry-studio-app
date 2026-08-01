import type { OAuthProviderContext } from '@/shared/oauth';

export type CompleteOAuthAuthorizationInput = {
  code: string;
  codeVerifier: string;
  context?: OAuthProviderContext;
  providerId: string;
  /**
   * The redirect URI the frontend authorized against. It travels with the
   * request because `expo-auth-session` resolves a different one under a dev
   * client than in a standalone build, and the exchange must echo it exactly.
   */
  redirectUri: string;
};

/**
 * Provider-generic OAuth surface. Every method is keyed by `providerId`, so
 * registering a provider in `@/shared/oauth` is enough to make it work here.
 *
 * Narrower than `OAuthRuntimeService`: session queries (`hasToken`,
 * `getAccount`) stay internal until a frontend owner actually needs them. The
 * settings screen reads sign-in state from the provider's auth config query.
 */
export interface OAuthBackend {
  completeAuthorization(input: CompleteOAuthAuthorizationInput): Promise<void>;
  logout(providerId: string, context?: OAuthProviderContext): Promise<void>;
}
