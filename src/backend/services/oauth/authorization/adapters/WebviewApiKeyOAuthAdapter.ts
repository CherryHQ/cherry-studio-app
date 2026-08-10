import type { StartOAuthAuthorizationInput } from '@/shared/contracts/oauth';
import type { OAuthConfigurationIssue } from '@/shared/oauth';
import { OAuthServiceError } from '@/shared/oauth';

import type { OAuthRuntimeProviderRepository } from '../../runtime/OAuthRuntimeService';
import { OAuthApiKeyStore } from '../OAuthApiKeyStore';
import type { OAuthFlowAdapter, OAuthFlowCompletionPayload, OAuthFlowSession } from '../types';

const MAX_WEBVIEW_MESSAGE_BYTES = 64 * 1024;

export interface WebviewApiKeyOAuthDefinition {
  allowedOrigins: string[];
  authorizationUrl(language: string): string;
  configurationIssue?: OAuthConfigurationIssue;
  decode(payload: unknown): string | undefined;
  providerId: string;
}

export class WebviewApiKeyOAuthAdapter implements OAuthFlowAdapter {
  readonly flowType = 'webview-api-key' as const;
  readonly providerId: string;

  constructor(
    private readonly definition: WebviewApiKeyOAuthDefinition,
    private readonly apiKeys: OAuthApiKeyStore,
    private readonly providers: Pick<OAuthRuntimeProviderRepository, 'update'>,
  ) {
    this.providerId = definition.providerId;
  }

  async getStatus() {
    return {
      accountId: null,
      isAuthenticated: await this.apiKeys.has(this.providerId),
      isConfigured: !this.definition.configurationIssue,
      ...(this.definition.configurationIssue
        ? { configurationIssue: this.definition.configurationIssue }
        : {}),
    };
  }

  logout() {
    return this.apiKeys.clear(this.providerId);
  }

  async start(input: StartOAuthAuthorizationInput): Promise<OAuthFlowSession> {
    if (this.definition.configurationIssue) {
      throw new OAuthServiceError(
        `${this.providerId} OAuth is unavailable in this build`,
        undefined,
        this.definition.configurationIssue,
      );
    }

    const language = input.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
    return {
      presentation: {
        allowedOrigins: this.definition.allowedOrigins,
        authorizationUrl: this.definition.authorizationUrl(language),
        type: 'webview-api-key',
      },
      complete: async (completion) => {
        this.assertCompletion(completion);
        const apiKey = this.extractApiKey(completion.sourceUrl, completion.data);
        if (!apiKey) return { status: 'ignored' };

        await this.apiKeys.replace(this.providerId, apiKey);
        await this.providers.update(this.providerId, { isEnabled: true });
        return { status: 'completed' };
      },
    };
  }

  private extractApiKey(sourceUrl: string, data: string): string | undefined {
    if (new TextEncoder().encode(data).byteLength > MAX_WEBVIEW_MESSAGE_BYTES) {
      throw new OAuthServiceError(
        'OAuth WebView message is too large',
        undefined,
        'InvalidWebviewMessage',
      );
    }

    let origin: string;
    try {
      origin = new URL(sourceUrl).origin;
    } catch {
      throw new OAuthServiceError(
        'OAuth WebView message has an invalid source URL',
        undefined,
        'InvalidWebviewOrigin',
      );
    }
    if (!this.definition.allowedOrigins.includes(origin)) {
      throw new OAuthServiceError(
        `OAuth WebView message came from an unauthorized origin: ${origin}`,
        undefined,
        'InvalidWebviewOrigin',
      );
    }

    return this.definition.decode(parseWebviewPayload(data));
  }

  private assertCompletion(
    input: OAuthFlowCompletionPayload,
  ): asserts input is Extract<OAuthFlowCompletionPayload, { type: 'webview-api-key' }> {
    if (input.type !== 'webview-api-key') {
      throw new OAuthServiceError(
        'WebView completion type does not match',
        undefined,
        'OAuthFlowTypeMismatch',
      );
    }
  }
}

function parseWebviewPayload(data: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (parsed && typeof parsed === 'object' && 'payload' in parsed) {
    return (parsed as { payload: unknown }).payload;
  }
  return parsed;
}
