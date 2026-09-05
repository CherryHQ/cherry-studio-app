import type {
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
} from '@/shared/data/types/webSearch';

export interface WebSearchModule {
  checkProvider(input: WebSearchCheckProviderRequest): Promise<WebSearchCheckProviderResponse>;
}
