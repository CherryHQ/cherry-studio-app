import type {
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
} from '@cherrystudio/universal/data/types/webSearch';

export interface WebSearchModule {
  checkProvider(input: WebSearchCheckProviderRequest): Promise<WebSearchCheckProviderResponse>;
}
