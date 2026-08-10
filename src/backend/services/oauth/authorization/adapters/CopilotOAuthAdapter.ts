import * as z from 'zod';

import type { StartOAuthAuthorizationInput } from '@/shared/contracts/oauth';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { describeOAuthError, OAuthServiceError } from '@/shared/oauth';

import type { OAuthRuntimeProviderRepository } from '../../runtime/OAuthRuntimeService';
import type { OAuthTokenStore } from '../../runtime/types';
import type { OAuthFlowAdapter, OAuthFlowCompletionPayload, OAuthFlowSession } from '../types';

export const COPILOT_PROVIDER_ID = 'copilot';

const COPILOT_CONFIG = {
  ACCESS_TOKEN_URL: 'https://github.com/login/oauth/access_token',
  CLIENT_ID: 'Iv1.b507a08c87ecfe98',
  DEVICE_CODE_URL: 'https://github.com/login/device/code',
  SCOPES: 'read:user',
  SERVING_TOKEN_URL: 'https://api.github.com/copilot_internal/v2/token',
  USER_URL: 'https://api.github.com/user',
} as const;

const COPILOT_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Editor-Plugin-Version': 'copilot.vim/1.16.0',
  'Editor-Version': 'Neovim/0.6.1',
  'User-Agent': 'GithubCopilot/1.155.0',
} as const;

const DeviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  expires_in: z.number().positive().default(900),
  interval: z.number().positive().default(5),
  user_code: z.string().min(1),
  verification_uri: z.url(),
});
const DeviceTokenResponseSchema = z.object({
  access_token: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
const CopilotServingTokenResponseSchema = z.object({ token: z.string().min(1) });
const GithubUserResponseSchema = z.object({ login: z.string().min(1) });
const logger = loggerService.withContext('CopilotOAuthAdapter');

export class CopilotOAuthAdapter implements OAuthFlowAdapter {
  readonly flowType = 'device-code-session' as const;
  readonly providerId = COPILOT_PROVIDER_ID;

  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly tokenStore: OAuthTokenStore,
    private readonly providers: Pick<OAuthRuntimeProviderRepository, 'update'>,
  ) {}

  async getStatus() {
    const credentials = await this.tokenStore.get(this.providerId);
    return {
      accountId: credentials?.accountId ?? null,
      isAuthenticated: Boolean(credentials?.accessToken),
      isConfigured: true,
    };
  }

  async logout(): Promise<void> {
    await this.tokenStore.clear(this.providerId, { disableProvider: true });
  }

  async start(
    _input: StartOAuthAuthorizationInput,
    signal: AbortSignal,
  ): Promise<OAuthFlowSession> {
    const response = await this.fetch(COPILOT_CONFIG.DEVICE_CODE_URL, {
      body: JSON.stringify({
        client_id: COPILOT_CONFIG.CLIENT_ID,
        scope: COPILOT_CONFIG.SCOPES,
      }),
      headers: COPILOT_HEADERS,
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      throw new OAuthServiceError(
        `GitHub device authorization failed: ${response.status}`,
        undefined,
        'CopilotDeviceCodeFailed',
      );
    }

    const device = DeviceCodeResponseSchema.parse(await response.json());
    const expiresInMs = device.expires_in * 1000;
    const expiresAt = Date.now() + expiresInMs;
    return {
      expiresInMs,
      presentation: {
        intervalSeconds: device.interval,
        type: 'device-code-session',
        userCode: device.user_code,
        verificationUri: device.verification_uri,
      },
      complete: async (completion, completionSignal) => {
        this.assertCompletion(completion);
        await this.pollForToken(device.device_code, device.interval, expiresAt, completionSignal);
        return { status: 'completed' };
      },
    };
  }

  async getServingToken(headers: Record<string, string>, signal?: AbortSignal): Promise<string> {
    const credentials = await this.tokenStore.get(this.providerId);
    if (!credentials?.accessToken) {
      throw new OAuthServiceError(
        'GitHub Copilot is not signed in',
        undefined,
        'OAuthSessionExpired',
      );
    }

    const response = await this.fetch(COPILOT_CONFIG.SERVING_TOKEN_URL, {
      headers: {
        ...COPILOT_HEADERS,
        ...headers,
        Authorization: `token ${credentials.accessToken}`,
      },
      method: 'GET',
      signal,
    });
    if (!response.ok) {
      if (response.status === 401) {
        await this.tokenStore.clear(this.providerId, { disableProvider: true });
      }
      throw new OAuthServiceError(
        `GitHub Copilot token request failed: ${response.status}`,
        undefined,
        'CopilotServingTokenFailed',
      );
    }
    return CopilotServingTokenResponseSchema.parse(await response.json()).token;
  }

  private async pollForToken(
    deviceCode: string,
    initialIntervalSeconds: number,
    expiresAt: number,
    signal: AbortSignal,
  ): Promise<void> {
    let intervalSeconds = initialIntervalSeconds;
    while (Date.now() < expiresAt) {
      await abortableDelay(intervalSeconds * 1000, signal);
      const response = await this.fetch(COPILOT_CONFIG.ACCESS_TOKEN_URL, {
        body: JSON.stringify({
          client_id: COPILOT_CONFIG.CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
        headers: COPILOT_HEADERS,
        method: 'POST',
        signal,
      });
      if (!response.ok) {
        throw new OAuthServiceError(
          `GitHub token polling failed: ${response.status}`,
          undefined,
          'CopilotTokenPollingFailed',
        );
      }

      const token = DeviceTokenResponseSchema.parse(await response.json());
      if (token.access_token) {
        const accountId = await this.fetchAccountId(token.access_token, signal);
        throwIfAborted(signal);
        await this.tokenStore.set(
          this.providerId,
          { accessToken: token.access_token, ...(accountId ? { accountId } : {}) },
          COPILOT_CONFIG.CLIENT_ID,
        );
        await this.providers.update(this.providerId, { isEnabled: true });
        return;
      }
      if (!token.error || token.error === 'authorization_pending') continue;
      if (token.error === 'slow_down') {
        intervalSeconds += 5;
        continue;
      }
      throw new OAuthServiceError(
        token.error_description ?? `GitHub device authorization failed: ${token.error}`,
        undefined,
        'CopilotAuthorizationFailed',
      );
    }

    throw new OAuthServiceError(
      'GitHub device authorization expired',
      undefined,
      'OAuthFlowExpired',
    );
  }

  private async fetchAccountId(
    accessToken: string,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    try {
      const response = await this.fetch(COPILOT_CONFIG.USER_URL, {
        headers: { ...COPILOT_HEADERS, Authorization: `token ${accessToken}` },
        method: 'GET',
        signal,
      });
      if (!response.ok) return undefined;
      return GithubUserResponseSchema.parse(await response.json()).login;
    } catch (error) {
      throwIfAborted(signal);
      logger.warn('Failed to load GitHub account after Copilot sign-in', describeOAuthError(error));
      return undefined;
    }
  }

  private assertCompletion(
    input: OAuthFlowCompletionPayload,
  ): asserts input is Extract<OAuthFlowCompletionPayload, { type: 'device-code-session' }> {
    if (input.type !== 'device-code-session') {
      throw new OAuthServiceError(
        'Copilot completion type does not match',
        undefined,
        'OAuthFlowTypeMismatch',
      );
    }
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('OAuth authorization cancelled');
}
