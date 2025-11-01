import { fetch } from 'expo/fetch'

import { loggerService } from '@/services/LoggerService'
import type { WebSearchProvider, WebSearchProviderResponse, WebSearchState } from '@/types/websearch'

import BaseWebSearchProvider from './BaseWebSearchProvider'
const logger = loggerService.withContext('ExaProvider')

export default class ExaProvider extends BaseWebSearchProvider {
  constructor(provider: WebSearchProvider) {
    super(provider)

    if (!this.apiKey) {
      throw new Error('API key is required for Exa provider')
    }

    if (!this.apiHost) {
      throw new Error('API host is required for Exa provider')
    }
  }

  public async search(query: string, websearch: WebSearchState): Promise<WebSearchProviderResponse> {
    try {
      if (!query.trim()) {
        throw new Error('Search query cannot be empty')
      }

      const url = new URL('/search', this.apiHost).toString()

      const requestBody = {
        query,
        numResults: Math.max(1, websearch.maxResults),
        useAutoprompt: true, // 为了获取 autopromptString
        text: true // 为了获取结果的文本内容
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': `${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API request failed with status ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      return {
        query: data.autopromptString || query, // 使用 autoprompt 结果或原始查询
        results: data.results.slice(0, websearch.maxResults).map((result: any) => {
          return {
            title: result.title || 'No title',
            content: result.text || '', // Exa 的内容字段是 'text'
            url: result.url || ''
          }
        })
      }
    } catch (error) {
      logger.error('Exa search failed:', error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
