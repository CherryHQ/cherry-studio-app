import { fetch } from 'expo/fetch'

import { loggerService } from '@/services/LoggerService'
import {
  WebSearchState,
  WebSearchProvider,
  WebSearchProviderResponse,
  WebSearchProviderResult
} from '@/types/websearch'

import BaseWebSearchProvider from './BaseWebSearchProvider'
const logger = loggerService.withContext('TavilyProvider')

interface RawSearchResult {
  title?: string
  content?: string
  url?: string
}

export default class TavilyProvider extends BaseWebSearchProvider {
  constructor(provider: WebSearchProvider) {
    super(provider)
    logger.info('TavilyProvider initialized with provider:', provider)

    if (!this.apiKey) {
      throw new Error('API key is required for Tavily provider')
    }

    if (!this.apiHost) {
      throw new Error('API host is required for Tavily provider')
    }
  }

  public async search(query: string, websearch: WebSearchState): Promise<WebSearchProviderResponse> {
    const { maxResults, contentLimit } = websearch

    try {
      if (!query.trim()) {
        throw new Error('Search query cannot be empty')
      }

      const url = new URL('/search', this.apiHost).toString()

      const requestBody = {
        query,
        search_depth: 'basic',
        max_results: Math.max(1, websearch.maxResults)
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API request failed with status ${response.status}: ${errorText}`)
      }

      const result = await response.json()

      const { results: rawResults } = result

      const formattedResults: WebSearchProviderResult[] = rawResults
        .slice(0, maxResults)
        .map((res: RawSearchResult) => {
          const title = res.title || 'No title'
          const url = res.url || ''

          const content =
            contentLimit !== undefined && contentLimit > 0
              ? (res.content || '').slice(0, contentLimit)
              : res.content || ''

          return {
            title,
            content,
            url
          }
        })

      return {
        query,
        results: formattedResults
      }
    } catch (error) {
      logger.error('Tavily search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
