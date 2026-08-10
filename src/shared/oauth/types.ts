export interface OAuthAccount {
  /** Provider account id associated with the OAuth session, when available. */
  accountId: string | null;
}

export type OAuthFlowType =
  | 'authorization-code-api-key'
  | 'blocked'
  | 'device-code-session'
  | 'pkce-session'
  | 'webview-api-key';

export type OAuthConfigurationIssue = 'missing-aihubmix-secret' | 'missing-ppio-secret';

interface OAuthFlowPresentationBase {
  expiresAt: number;
  flowId: string;
  providerId: string;
}

export type OAuthFlowPresentation =
  | (OAuthFlowPresentationBase & {
      authorizationUrl: string;
      redirectUri: string;
      type: 'authorization-code-api-key' | 'pkce-session';
    })
  | (OAuthFlowPresentationBase & {
      intervalSeconds: number;
      type: 'device-code-session';
      userCode: string;
      verificationUri: string;
    })
  | (OAuthFlowPresentationBase & {
      allowedOrigins: string[];
      authorizationUrl: string;
      type: 'webview-api-key';
    });

export type OAuthFlowCompletionInput =
  | {
      callbackUrl: string;
      flowId: string;
      type: 'authorization-code-api-key' | 'pkce-session';
    }
  | { flowId: string; type: 'device-code-session' }
  | {
      data: string;
      flowId: string;
      sourceUrl: string;
      type: 'webview-api-key';
    };

export type OAuthFlowCompletionResult = {
  status: 'completed' | 'ignored';
};

export interface OAuthProviderStatus {
  accountId: string | null;
  flowType: OAuthFlowType;
  isAuthenticated: boolean;
  isConfigured: boolean;
  providerId: string;
  configurationIssue?: OAuthConfigurationIssue;
}

export interface OAuthTokenCredentials {
  accessToken: string;
  accountId?: string | null;
}

export interface OAuthProviderContext {
  apiHost?: string;
  /** Bypass the local expiry check and refresh anyway (the 401 retry path). */
  forceRefresh?: boolean;
  oauthServer?: string;
}
