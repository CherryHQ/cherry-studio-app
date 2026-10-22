import type { WebSearchTransport } from '@cherrystudio/web-search';

import type {
  WebSearchProvider,
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@/shared/data/types/webSearch';

import type { ApiKeyRotationState } from '../utils/provider';
import { FetchProvider } from './api/FetchProvider';
import { JinaProvider } from './api/JinaProvider';
import type { BaseWebSearchProvider } from './base/BaseWebSearchProvider';
import { RemoteWebSearchProvider } from './base/RemoteWebSearchProvider';
import { REMOTE_WEB_SEARCH_PROVIDERS } from './registry';

export type WebSearchProviderDriver = BaseWebSearchProvider & {
  searchKeywords?: (
    input: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ) => Promise<WebSearchResponse>;
  fetchUrls?: (
    input: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ) => Promise<WebSearchResponse>;
};

export function createWebSearchProvider(
  provider: WebSearchProvider,
  apiKeyRotationState: ApiKeyRotationState,
  transport?: WebSearchTransport,
): WebSearchProviderDriver {
  if (provider.id === 'fetch') return new FetchProvider(provider, apiKeyRotationState);
  const Provider = provider.id === 'jina' ? JinaProvider : RemoteWebSearchProvider;
  return new Provider(
    provider,
    apiKeyRotationState,
    REMOTE_WEB_SEARCH_PROVIDERS[provider.id],
    transport,
  );
}
