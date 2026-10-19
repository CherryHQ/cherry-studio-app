import {
  createWebSearchClient,
  type WebSearchClient,
  type WebSearchCredentials,
  type WebSearchProviderModule,
  type WebSearchTransport,
} from '@cherrystudio/web-search';

import type {
  WebSearchCapability,
  WebSearchExecutionConfig,
  WebSearchProvider,
  WebSearchResponse,
} from '@/shared/data/types/webSearch';

import { mobileWebSearchTransport } from '../../transport';
import { type ApiKeyRotationState, resolveProviderApiHost } from '../../utils/provider';
import { BaseWebSearchProvider } from './BaseWebSearchProvider';

export class RemoteWebSearchProvider extends BaseWebSearchProvider {
  private readonly client: WebSearchClient;

  constructor(
    provider: WebSearchProvider,
    state: ApiKeyRotationState,
    private readonly protocol: WebSearchProviderModule,
    transport: WebSearchTransport = mobileWebSearchTransport,
  ) {
    super(provider, state);
    this.client = createWebSearchClient({
      transport,
      providers: [
        {
          provider: protocol,
          capabilities: protocol.metadata.capabilities
            .filter((item) =>
              provider.capabilities.some((enabled) => enabled.feature === item.capability),
            )
            .map((item) => item.capability),
        },
      ],
    });
  }

  protected credentials(capability: WebSearchCapability): WebSearchCredentials {
    return {
      apiKey:
        this.protocol.metadata.capabilities.find((item) => item.capability === capability)
          ?.apiKey === 'unused'
          ? undefined
          : this.resolveApiKey(false),
      ...(this.provider.id === 'searxng'
        ? {
            basicAuth: {
              username: this.provider.basicAuthUsername.trim(),
              password: this.provider.basicAuthPassword.trim(),
            },
          }
        : {}),
    };
  }

  searchKeywords(input: string, config: WebSearchExecutionConfig, options?: RequestInit) {
    return this.executeRemote('searchKeywords', input, config, options);
  }

  fetchUrls(input: string, config: WebSearchExecutionConfig, options?: RequestInit) {
    return this.executeRemote('fetchUrls', input, config, options);
  }

  protected async executeRemote(
    capability: WebSearchCapability,
    input: string,
    config: WebSearchExecutionConfig,
    options?: RequestInit,
    overrides: { apiHost?: string; credentials?: WebSearchCredentials } = {},
  ): Promise<WebSearchResponse> {
    this.validateConfiguration(capability);
    if (capability === 'fetchUrls') input = input.trim();
    const common = {
      providerId: this.protocol.metadata.id,
      input,
      credentials: overrides.credentials ?? this.credentials(capability),
      signal: options?.signal ?? undefined,
      timeoutMs:
        capability === 'fetchUrls' ? 60_000 : this.provider.id === 'exa-mcp' ? 25_000 : undefined,
    };
    const apiHost = overrides.apiHost ?? resolveProviderApiHost(this.provider, capability);
    const response = await this.client.execute(
      capability === 'searchKeywords'
        ? {
            ...common,
            capability,
            config: {
              apiHost,
              maxResults: config.maxResults,
              ...(this.provider.id === 'searxng' ? { engines: this.provider.engines } : {}),
            },
          }
        : {
            ...common,
            capability,
            config: {
              apiHost,
              ...(this.provider.id === 'exa-mcp' ? { maxCharacters: 24_000 } : {}),
            },
          },
    );
    return {
      query: input,
      providerId: this.provider.id,
      capability,
      inputs: [input],
      results: response.results.map((item) => ({ ...item })),
    };
  }
}
