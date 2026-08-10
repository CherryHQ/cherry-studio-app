import type {
  OAuthFlowCompletionInput,
  OAuthFlowCompletionResult,
  OAuthFlowPresentation,
  OAuthProviderContext,
  OAuthProviderStatus,
} from '@/shared/oauth';

export type StartOAuthAuthorizationInput = {
  context?: OAuthProviderContext;
  language?: string;
  providerId: string;
  redirectUri?: string;
};

/**
 * Provider-generic OAuth surface. Every method is keyed by `providerId`; the
 * backend registry owns which providers and flow adapters are available.
 *
 * Narrower than `OAuthRuntimeService`: session queries (`hasToken`,
 * `getAccount`) stay internal until a frontend owner actually needs them. The
 * settings screen reads sign-in state from the provider's auth config query.
 */
export interface OAuthModule {
  cancelAuthorization(flowId: string): Promise<void>;
  completeAuthorization(input: OAuthFlowCompletionInput): Promise<OAuthFlowCompletionResult>;
  getAuthorization(flowId: string): Promise<OAuthFlowPresentation>;
  getStatus(providerId: string): Promise<OAuthProviderStatus>;
  logout(providerId: string, context?: OAuthProviderContext): Promise<void>;
  startAuthorization(input: StartOAuthAuthorizationInput): Promise<OAuthFlowPresentation>;
}
