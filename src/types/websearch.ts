import type { LanguageModelV2Source } from '@ai-sdk/provider'
import type { WebSearchResultBlock } from '@anthropic-ai/sdk/resources'
import type { GroundingMetadata } from '@google/genai'
import type OpenAI from 'openai'

export interface WebSearchState {
  // 是否在搜索查询中添加当前日期
  searchWithTime: boolean
  // 搜索结果的最大数量
  maxResults: number
  // 是否覆盖搜索服务
  overrideSearchService: boolean
  // 内容限制
  contentLimit?: number
}

export type CherryWebSearchConfig = Pick<WebSearchState, 'searchWithTime' | 'maxResults'>

export type WebSearchProvider = {
  id: string
  name: string
  type: 'builtin' | 'free' | 'api'
  apiKey?: string
  apiHost?: string
  engines?: string[]
  url?: string
  basicAuthUsername?: string
  basicAuthPassword?: string
  contentLimit?: number
  usingBrowser?: boolean
}

export enum WebSearchSource {
  WEBSEARCH = 'websearch',
  OPENAI = 'openai',
  OPENAI_RESPONSE = 'openai-response',
  OPENROUTER = 'openrouter',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
  PERPLEXITY = 'perplexity',
  QWEN = 'qwen',
  HUNYUAN = 'hunyuan',
  ZHIPU = 'zhipu',
  GROK = 'grok',
  AISDK = 'ai-sdk'
}

export type WebSearchResponse = {
  results: WebSearchResults
  source: WebSearchSource
}

export type WebSearchProviderResult = {
  title: string
  content: string
  url: string
}

export type WebSearchProviderResponse = {
  query?: string
  results: WebSearchProviderResult[]
}

export type AISDKWebSearchResult = Omit<Extract<LanguageModelV2Source, { sourceType: 'url' }>, 'sourceType'>

export type WebSearchResults =
  | WebSearchProviderResponse
  | GroundingMetadata
  | OpenAI.Chat.Completions.ChatCompletionMessage.Annotation.URLCitation[]
  | OpenAI.Responses.ResponseOutputText.URLCitation[]
  | WebSearchResultBlock[]
  | AISDKWebSearchResult[]
  | any[]

export type WebSearchPhase = 'default' | 'fetch_complete' | 'rag' | 'rag_complete' | 'rag_failed' | 'cutoff'

export type WebSearchStatus = {
  phase: WebSearchPhase
  countBefore?: number
  countAfter?: number
}

export interface Citation {
  number: number
  url: string
  title?: string
  hostname?: string
  content?: string
  showFavicon?: boolean
  type?: string
  metadata?: Record<string, any>
}
