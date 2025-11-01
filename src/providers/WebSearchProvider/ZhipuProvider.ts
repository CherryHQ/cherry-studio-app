import { fetch } from 'expo/fetch'

import { loggerService } from '@/services/LoggerService'
import type {
  WebSearchProvider,
  WebSearchProviderResponse,
  WebSearchProviderResult,
  WebSearchState
} from '@/types/websearch'

import BaseWebSearchProvider from './BaseWebSearchProvider'

const logger = loggerService.withContext('ZhipuProvider')

interface ZhipuWebSearchRequest {
  search_query: string
  search_engine?: string
  search_intent?: boolean
}

interface ZhipuWebSearchResponse {
  id: string
  created: number
  request_id: string
  search_intent?: {
    query: string
    intent: string
    keywords: string
  }[]
  search_result: {
    title: string
    content: string
    link: string
    media?: string
    icon?: string
    refer?: string
    publish_date?: string
  }[]
}

export default class ZhipuProvider extends BaseWebSearchProvider {
  constructor(provider: WebSearchProvider) {
    super(provider)
    logger.info('ZhipuProvider initialized with provider:', provider)

    if (!this.apiKey) {
      throw new Error('API key is required for Zhipu provider')
    }

    if (!this.apiHost) {
      throw new Error('API host is required for Zhipu provider')
    }
  }

  public async search(query: string, websearch: WebSearchState): Promise<WebSearchProviderResponse> {
    const { maxResults, contentLimit } = websearch

    try {
      if (!query.trim()) {
        throw new Error('Search query cannot be empty')
      }

      const requestBody: ZhipuWebSearchRequest = {
        search_query: query,
        search_engine: 'search_std',
        search_intent: false
      }

      const response = await fetch(`${this.apiHost}`, {
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

      const result: ZhipuWebSearchResponse = await response.json()

      const formattedResults: WebSearchProviderResult[] = result.search_result.slice(0, maxResults).map(res => {
        const title = res.title || 'No title'
        const url = res.link || ''

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
      logger.error('Zhipu search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
