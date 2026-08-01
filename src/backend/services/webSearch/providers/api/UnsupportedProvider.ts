import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';

export class UnsupportedProvider extends BaseWebSearchProvider {
  async searchKeywords(): Promise<WebSearchResponse> {
    return Promise.reject(
      new Error(`Web search provider ${this.provider.id} is not supported on mobile`),
    );
  }

  async fetchUrls(
    _query: string,
    _config: WebSearchExecutionConfig,
    _httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    return Promise.reject(
      new Error(`Web search provider ${this.provider.id} is not supported on mobile`),
    );
  }
}
