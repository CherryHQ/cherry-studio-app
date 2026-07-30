import type {
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
} from '@/shared/data/types/webSearch';

export interface WebSearchBackend {
  checkProvider(input: WebSearchCheckProviderRequest): Promise<WebSearchCheckProviderResponse>;
}
