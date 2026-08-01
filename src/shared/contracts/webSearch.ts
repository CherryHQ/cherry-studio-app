import type {
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
} from '@cherrystudio/universal/data/types/webSearch';

export interface WebSearchBackend {
  checkProvider(input: WebSearchCheckProviderRequest): Promise<WebSearchCheckProviderResponse>;
}
