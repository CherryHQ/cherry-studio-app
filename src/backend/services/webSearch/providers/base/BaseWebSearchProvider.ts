import type * as z from 'zod';

import type { HttpHeaders } from '@/backend/services/http';
import type { WebSearchCapability, WebSearchProvider } from '@/shared/data/types/webSearch';

import { requestWebSearchJson, type WebSearchJsonRequester } from '../../http/requestWebSearchJson';
import type { ApiKeyRotationState } from '../../utils/provider';
import { assertProviderReady, resolveProviderApiHost } from '../../utils/provider';
import { withoutTrailingSlash } from '../../utils/url';

export abstract class BaseWebSearchProvider {
  constructor(
    protected readonly provider: WebSearchProvider,
    private readonly apiKeyRotationState: ApiKeyRotationState,
    private readonly jsonRequester: WebSearchJsonRequester = requestWebSearchJson,
  ) {}

  /** Configuration-only check: never consumes a key or makes a network request. */
  validateConfiguration(capability: WebSearchCapability): void {
    assertProviderReady(this.provider, capability);
  }

  protected resolveApiUrl(capability: WebSearchCapability, path: string): string {
    const apiHost = resolveProviderApiHost(this.provider, capability);
    const normalizedBaseUrl = `${withoutTrailingSlash(apiHost)}/`;
    const normalizedPath = path.replace(/^\//, '');
    return new URL(normalizedPath, normalizedBaseUrl).toString();
  }

  protected resolveApiKey(required = true): string {
    return this.apiKeyRotationState.resolve(this.provider, required);
  }

  protected requestJson<TResponse, TBody = unknown>(request: {
    body?: TBody;
    headers?: HttpHeaders;
    method: 'GET' | 'POST';
    operation: string;
    responseSchema: z.ZodType<TResponse>;
    signal?: AbortSignal;
    timeoutMs?: number;
    url: string;
  }): Promise<TResponse> {
    return this.jsonRequester<TResponse, TBody>({
      ...request,
      providerId: this.provider.id,
    });
  }
}
