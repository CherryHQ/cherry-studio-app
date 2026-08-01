import type {
  WebSearchCheckProviderRequest,
  WebSearchCheckProviderResponse,
} from '@cherrystudio/shared/data/types/webSearch';

export interface WebSearchBackend {
  checkProvider(input: WebSearchCheckProviderRequest): Promise<WebSearchCheckProviderResponse>;
}
