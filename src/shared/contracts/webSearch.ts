import type {
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
} from '@/shared/domain/webSearch';

export interface WebSearchBackend {
  checkProvider(input: WebSearchCheckProviderRequest): Promise<WebSearchCheckProviderResponse>;
}
