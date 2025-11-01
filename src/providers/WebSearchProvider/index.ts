import { WebSearchState, WebSearchProvider, WebSearchProviderResponse } from '@/types/websearch'
import { filterResultWithBlacklist } from '@/utils/blacklistMatchPattern'

import BaseWebSearchProvider from './BaseWebSearchProvider'
import WebSearchProviderFactory from './WebSearchProviderFactory'

export default class WebSearchEngineProvider {
  private sdk: BaseWebSearchProvider

  constructor(provider: WebSearchProvider) {
    this.sdk = WebSearchProviderFactory.create(provider)
  }
  public async search(
    query: string,
    websearch: WebSearchState,
    httpOptions?: RequestInit
  ): Promise<WebSearchProviderResponse> {
    const result = await this.sdk.search(query, websearch, httpOptions)
    return await filterResultWithBlacklist(result, websearch)
  }
}
