import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { WebSearchConfigError } from '../../WebSearchConfigError';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';

/**
 * Stands in for providers whose desktop implementation needs a platform
 * capability mobile does not have.
 */
export class UnsupportedProvider extends BaseWebSearchProvider {
  async searchKeywords(): Promise<WebSearchResponse> {
    return Promise.reject(this.unsupported());
  }

  async fetchUrls(
    _query: string,
    _config: WebSearchExecutionConfig,
    _httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    return Promise.reject(this.unsupported());
  }

  private unsupported(): WebSearchConfigError {
    return new WebSearchConfigError(
      'provider_unsupported_on_platform',
      `Web search provider ${this.provider.id} is not supported on mobile`,
    );
  }
}
