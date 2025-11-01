import type { FetchRequestInit } from 'expo/fetch'

import type { WebSearchProvider, WebSearchProviderResponse, WebSearchState } from '@/types/websearch'

export default abstract class BaseWebSearchProvider {
  protected provider: WebSearchProvider
  protected apiHost?: string
  protected apiKey?: string

  constructor(provider: WebSearchProvider) {
    this.provider = provider

    if (provider.apiHost) this.apiHost = provider.apiHost
    if (provider.apiKey) this.apiKey = provider.apiKey
  }

  abstract search(
    query: string,
    websearch: WebSearchState,
    httpOptions?: FetchRequestInit
  ): Promise<WebSearchProviderResponse>

  public defaultHeaders() {
    return {
      'HTTP-Referer': 'https://cherry-ai.com',
      'X-Title': 'Cherry Studio'
    }
  }
}
