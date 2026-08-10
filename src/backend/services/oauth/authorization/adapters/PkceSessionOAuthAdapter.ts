import type { StartOAuthAuthorizationInput } from '@/shared/contracts/oauth';
import { OAuthServiceError } from '@/shared/oauth';

import type { OAuthRuntimeService } from '../../runtime/OAuthRuntimeService';
import type { OAuthRuntimeProviderDefinition } from '../../runtime/types';
import {
  createPkceAuthorization,
  parseAuthorizationCallback,
  validateRedirectUri,
} from '../authorizationCode';
import type { OAuthFlowAdapter, OAuthFlowCompletionPayload, OAuthFlowSession } from '../types';

const DEFAULT_REDIRECT_URI = 'cherrystudio://oauth/callback';

export class PkceSessionOAuthAdapter implements OAuthFlowAdapter {
  readonly flowType = 'pkce-session' as const;
  readonly providerId: string;

  constructor(
    private readonly definition: OAuthRuntimeProviderDefinition,
    private readonly runtime: OAuthRuntimeService,
  ) {
    this.providerId = definition.providerId;
  }

  async getStatus() {
    const isAuthenticated = await this.runtime.hasToken(this.providerId);
    const account = isAuthenticated
      ? await this.runtime.getAccount(this.providerId)
      : { accountId: null };
    return { accountId: account.accountId, isAuthenticated, isConfigured: true };
  }

  logout(context = {}) {
    return this.runtime.logout(this.providerId, context);
  }

  async start(input: StartOAuthAuthorizationInput): Promise<OAuthFlowSession> {
    const redirectUri = validateRedirectUri(
      input.redirectUri ?? DEFAULT_REDIRECT_URI,
      this.definition.redirect,
    );
    const { codeChallenge, codeVerifier, state } = await createPkceAuthorization();
    const authorizationUrl = new URL(this.definition.resolveEndpoints(input.context).authorizeUrl);
    authorizationUrl.searchParams.set('client_id', this.definition.clientId);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', this.definition.scopes);
    authorizationUrl.searchParams.set('state', state);

    return {
      presentation: {
        authorizationUrl: authorizationUrl.toString(),
        redirectUri,
        type: 'pkce-session',
      },
      complete: async (completion, signal) => {
        this.assertCompletion(completion);
        await this.runtime.completeAuthorization({
          code: parseAuthorizationCallback(completion.callbackUrl, redirectUri, state),
          codeVerifier,
          context: input.context,
          providerId: this.providerId,
          redirectUri,
          signal,
        });
        return { status: 'completed' };
      },
    };
  }

  private assertCompletion(
    input: OAuthFlowCompletionPayload,
  ): asserts input is Extract<OAuthFlowCompletionPayload, { type: 'pkce-session' }> {
    if (input.type !== 'pkce-session') {
      throw new OAuthServiceError(
        'PKCE completion type does not match',
        undefined,
        'OAuthFlowTypeMismatch',
      );
    }
  }
}
