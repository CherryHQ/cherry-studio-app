import type * as z from 'zod';

import type { HttpHeaders } from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import type { WebSearchCapability, WebSearchProvider } from '@/shared/data/types/webSearch';

import { requestWebSearchJson, type WebSearchJsonRequester } from '../../http/requestWebSearchJson';
import type { ApiKeyRotationState } from '../../utils/provider';
import { resolveProviderApiHost } from '../../utils/provider';
import { withoutTrailingSlash } from '../../utils/url';

const MAX_HTTP_ERROR_TEXT_LENGTH = 500;

export abstract class BaseWebSearchProvider {
  constructor(
    protected readonly provider: WebSearchProvider,
    private readonly apiKeyRotationState: ApiKeyRotationState,
    private readonly jsonRequester: WebSearchJsonRequester = requestWebSearchJson,
  ) {}

  protected resolveApiUrl(capability: WebSearchCapability, path: string): string {
    const apiHost = resolveProviderApiHost(this.provider, capability);
    const normalizedBaseUrl = `${withoutTrailingSlash(apiHost)}/`;
    const normalizedPath = path.replace(/^\//, '');
    return new URL(normalizedPath, normalizedBaseUrl).toString();
  }

  protected resolveApiKey(required = true): string {
    return this.apiKeyRotationState.resolve(this.provider, required);
  }

  protected buildHeaders(headers?: HeadersInit): Headers {
    const resolvedHeaders = new Headers(defaultAppHeaders());
    const extraHeaders = new Headers(headers);

    extraHeaders.forEach((value, key) => {
      resolvedHeaders.set(key, value);
    });

    return resolvedHeaders;
  }

  protected requestJson<TResponse, TBody = unknown>(request: {
    body?: TBody;
    headers?: HttpHeaders;
    method: 'GET' | 'POST';
    operation: string;
    responseSchema: z.ZodType<TResponse>;
    signal?: AbortSignal;
    url: string;
  }): Promise<TResponse> {
    return this.jsonRequester<TResponse, TBody>({
      ...request,
      providerId: this.provider.id,
    });
  }

  protected async throwHttpError(message: string, response: Response): Promise<never> {
    const errorText = (await response.text()).trim();

    if (!errorText) {
      throw new Error(`${message}: HTTP ${response.status}`);
    }

    const truncatedErrorText =
      errorText.length > MAX_HTTP_ERROR_TEXT_LENGTH
        ? `${errorText.slice(0, MAX_HTTP_ERROR_TEXT_LENGTH)}... [truncated]`
        : errorText;

    throw new Error(`${message}: HTTP ${response.status} ${truncatedErrorText}`);
  }
}
