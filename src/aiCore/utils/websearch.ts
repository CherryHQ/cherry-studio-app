import { isOpenAIWebSearchChatCompletionOnlyModel } from '@/config/models/webSearch'
import { WEB_SEARCH_PROMPT_FOR_OPENROUTER } from '@/config/prompts'
import { Assistant, Model } from '@/types/assistant'
import { ExtractResults } from '@/types/extract'
import { Message } from '@/types/message'
import { getMainTextContent } from '@/utils/messageUtils/find'

export function getWebSearchParams(model: Model): Record<string, any> {
  if (model.provider === 'hunyuan') {
    return { enable_enhancement: true, citation: true, search_info: true }
  }

  if (model.provider === 'dashscope') {
    return {
      enable_search: true,
      search_options: {
        forced_search: true
      }
    }
  }

  if (isOpenAIWebSearchChatCompletionOnlyModel(model)) {
    return {
      web_search_options: {}
    }
  }

  if (model.provider === 'openrouter') {
    return {
      plugins: [{ id: 'web', search_prompts: WEB_SEARCH_PROMPT_FOR_OPENROUTER }]
    }
  }

  return {}
}

/**
 * 提取外部工具搜索关键词和问题
 * 从用户消息中提取用于网络搜索和知识库搜索的关键词
 */
export async function extractSearchKeywords(
  lastUserMessage: Message,
  assistant: Assistant,
  options: {
    shouldWebSearch?: boolean
    shouldKnowledgeSearch?: boolean
    lastAnswer?: Message
  } = {}
): Promise<ExtractResults | undefined> {
  // todo
  const { shouldWebSearch = false, shouldKnowledgeSearch = false, lastAnswer } = options

  if (!lastUserMessage) return undefined

  return await getFallbackResult()

  async function getFallbackResult(): Promise<ExtractResults> {
    const fallbackContent = await getMainTextContent(lastUserMessage)
    return {
      websearch: shouldWebSearch ? { question: [fallbackContent || 'search'] } : undefined,
      knowledge: shouldKnowledgeSearch
        ? {
            question: [fallbackContent || 'search'],
            rewrite: fallbackContent || 'search'
          }
        : undefined
    }
  }
}