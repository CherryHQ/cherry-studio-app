import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { StartOAuthAuthorizationInput } from '@/shared/contracts/oauth';
import { OAuthServiceError } from '@/shared/oauth';

import type { OAuthRuntimeProviderRepository } from '../../runtime/OAuthRuntimeService';
import { parseAuthorizationCallback, validateRedirectUri } from '../authorizationCode';
import { OAuthApiKeyStore } from '../OAuthApiKeyStore';
import type { OAuthFlowAdapter, OAuthFlowCompletionPayload, OAuthFlowSession } from '../types';

const PPIO_PROVIDER_ID = 'ppio';
const PPIO_CLIENT_ID = '37d0828c96b34936a600b62c';
const DEFAULT_REDIRECT_URI = 'cherrystudio://oauth/callback';
const PpioTokenResponseSchema = z.object({ access_token: z.string().min(1) });

export class PpioOAuthAdapter implements OAuthFlowAdapter {
  readonly flowType = 'authorization-code-api-key' as const;
  readonly providerId = PPIO_PROVIDER_ID;

  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly secret: string | undefined,
    private readonly apiKeys: OAuthApiKeyStore,
    private readonly providers: Pick<OAuthRuntimeProviderRepository, 'update'>,
  ) {}

  async getStatus() {
    return {
      accountId: null,
      isAuthenticated: await this.apiKeys.has(this.providerId),
      isConfigured: Boolean(this.secret),
      ...(!this.secret ? { configurationIssue: 'missing-ppio-secret' as const } : {}),
    };
  }

  logout() {
    return this.apiKeys.clear(this.providerId);
  }

  async start(input: StartOAuthAuthorizationInput): Promise<OAuthFlowSession> {
    if (!this.secret) {
      throw new OAuthServiceError(
        'PPIO OAuth is unavailable in this build',
        undefined,
        'missing-ppio-secret',
      );
    }

    const redirectUri = validateRedirectUri(input.redirectUri ?? DEFAULT_REDIRECT_URI, {
      path: 'oauth/callback',
      scheme: 'cherrystudio',
    });
    const state = randomUUID();
    const authorizationUrl = new URL('https://ppio.com/oauth/authorize');
    authorizationUrl.searchParams.set('client_id', PPIO_CLIENT_ID);
    authorizationUrl.searchParams.set('invited_by', 'JYT9GD');
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'api openid');
    authorizationUrl.searchParams.set('state', state);

    return {
      presentation: {
        authorizationUrl: authorizationUrl.toString(),
        redirectUri,
        type: 'authorization-code-api-key',
      },
      complete: async (completion, signal) => {
        this.assertCompletion(completion);
        const code = parseAuthorizationCallback(completion.callbackUrl, redirectUri, state);
        const response = await this.fetch('https://ppio.com/oauth/token', {
          body: new URLSearchParams({
            client_id: PPIO_CLIENT_ID,
            client_secret: this.secret ?? '',
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }).toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
          signal,
        });
        if (!response.ok) {
          throw new OAuthServiceError(
            `PPIO token exchange failed: ${response.status}`,
            undefined,
            'OAuthTokenExchangeFailed',
          );
        }

        const { access_token: accessToken } = PpioTokenResponseSchema.parse(await response.json());
        await this.apiKeys.replace(this.providerId, accessToken);
        await this.providers.update(this.providerId, { isEnabled: true });
        return { status: 'completed' };
      },
    };
  }

  private assertCompletion(
    input: OAuthFlowCompletionPayload,
  ): asserts input is Extract<OAuthFlowCompletionPayload, { type: 'authorization-code-api-key' }> {
    if (input.type !== 'authorization-code-api-key') {
      throw new OAuthServiceError(
        'PPIO completion type does not match',
        undefined,
        'OAuthFlowTypeMismatch',
      );
    }
  }
}
