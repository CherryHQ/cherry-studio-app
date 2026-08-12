import type { StartOAuthAuthorizationInput } from '@/shared/contracts/oauth';
import type {
  OAuthConfigurationIssue,
  OAuthFlowCompletionInput,
  OAuthFlowCompletionResult,
  OAuthFlowPresentation,
  OAuthFlowType,
  OAuthProviderContext,
} from '@/shared/oauth';

export type OAuthFlowDraft =
  | {
      authorizationUrl: string;
      redirectUri: string;
      type: 'authorization-code-api-key' | 'pkce-session';
    }
  | {
      intervalSeconds: number;
      type: 'device-code-session';
      userCode: string;
      verificationUri: string;
    }
  | {
      allowedOrigins: string[];
      authorizationUrl: string;
      type: 'webview-api-key';
    };

export type OAuthFlowCompletionPayload =
  | { callbackUrl: string; type: 'authorization-code-api-key' }
  | { callbackUrl: string; type: 'pkce-session' }
  | { type: 'device-code-session' }
  | {
      data: string;
      sourceUrl: string;
      type: 'webview-api-key';
    };

export type OAuthProviderStatusState = {
  accountId: string | null;
  isAuthenticated: boolean;
  isConfigured: boolean;
  configurationIssue?: OAuthConfigurationIssue;
};

export interface OAuthFlowSession {
  readonly expiresInMs?: number;
  readonly presentation: OAuthFlowDraft;
  complete(
    input: OAuthFlowCompletionPayload,
    signal: AbortSignal,
  ): Promise<OAuthFlowCompletionResult>;
}

export interface OAuthFlowAdapter {
  readonly flowType: OAuthFlowType;
  readonly providerId: string;
  getStatus(): Promise<OAuthProviderStatusState>;
  logout(context?: OAuthProviderContext): Promise<void>;
  start(input: StartOAuthAuthorizationInput, signal: AbortSignal): Promise<OAuthFlowSession>;
  /**
   * Optional capability: mint the short-lived token this provider's API expects,
   * from the session already stored for it.
   *
   * Declared on the contract rather than reached through the concrete adapter so
   * that `ProviderOAuthService` can serve it without learning a provider's name
   * — the rule this module's README states for the generic runtime and the
   * public contract.
   */
  getServingToken?(headers: Record<string, string>, signal?: AbortSignal): Promise<string>;
}

export type ActiveOAuthFlow = {
  adapter: OAuthFlowAdapter;
  completing: boolean;
  controller: AbortController;
  expiresAt: number;
  flowId: string;
  presentation: OAuthFlowPresentation;
  session: OAuthFlowSession;
  timeout: ReturnType<typeof setTimeout>;
};

export function toCompletionPayload(input: OAuthFlowCompletionInput): OAuthFlowCompletionPayload {
  switch (input.type) {
    case 'authorization-code-api-key':
    case 'pkce-session':
      return { callbackUrl: input.callbackUrl, type: input.type };
    case 'device-code-session':
      return { type: input.type };
    case 'webview-api-key':
      return { data: input.data, sourceUrl: input.sourceUrl, type: input.type };
  }
}
