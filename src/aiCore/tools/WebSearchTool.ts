import { type InferToolOutput, tool } from 'ai'
import { z } from 'zod'

import WebSearchService from '@/services/WebSearchService'
import { Assistant } from '@/types/assistant'
import { ExtractResults } from '@/types/extract'
import { Message, UserMessageStatus } from '@/types/message'
import { WebSearchProvider } from '@/types/websearch'

import { extractSearchKeywords } from '../transformParameters'

const WebSearchProviderResult = z.object({
  query: z.string().optional(),
  results: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      url: z.string()
    })
  )
})

export const webSearchTool = (webSearchProviderId: WebSearchProvider['id']) => {
  const webSearchService = WebSearchService.getInstance(webSearchProviderId)
  return tool({
    name: 'builtin_web_search',
    description: 'Search the web for information',
    inputSchema: z.object({
      query: z.string().describe('The query to search for')
    }),
    outputSchema: WebSearchProviderResult,
    execute: async ({ query }) => {
      console.log('webSearchTool', query)
      const response = await webSearchService.search(query)
      console.log('webSearchTool response', response)
      return response
    }
  })
}

export type WebSearchToolOutput = InferToolOutput<ReturnType<typeof webSearchTool>>

export const webSearchToolWithExtraction = (
  webSearchProviderId: WebSearchProvider['id'],
  requestId: string,
  assistant: Assistant
) => {
  const webSearchService = WebSearchService.getInstance(webSearchProviderId)

  return tool({
    name: 'web_search_with_extraction',
    description: 'Search the web for information with automatic keyword extraction from user messages',
    inputSchema: z.object({
      userMessage: z.object({
        content: z.string().describe('The main content of the message'),
        role: z.enum(['user', 'assistant', 'system']).describe('Message role')
      }),
      lastAnswer: z.object({
        content: z.string().describe('The main content of the message'),
        role: z.enum(['user', 'assistant', 'system']).describe('Message role')
      })
    }),
    outputSchema: z.object({
      extractedKeywords: z.object({
        question: z.array(z.string()),
        links: z.array(z.string()).optional()
      }),
      searchResults: z.array(
        z.object({
          query: z.string(),
          results: WebSearchProviderResult
        })
      )
    }),
    execute: async ({ userMessage, lastAnswer }) => {
      const lastUserMessage: Message = {
        id: requestId,
        role: userMessage.role,
        assistantId: assistant.id,
        topicId: 'temp',
        createdAt: new Date().toISOString(),
        status: UserMessageStatus.SUCCESS,
        blocks: []
      }

      const lastAnswerMessage: Message | undefined = lastAnswer
        ? {
            id: requestId + '_answer',
            role: lastAnswer.role,
            assistantId: assistant.id,
            topicId: 'temp',
            createdAt: new Date().toISOString(),
            status: UserMessageStatus.SUCCESS,
            blocks: []
          }
        : undefined

      const extractResults = await extractSearchKeywords(lastUserMessage, assistant, {
        shouldWebSearch: true,
        shouldKnowledgeSearch: false,
        lastAnswer: lastAnswerMessage
      })

      if (!extractResults?.websearch || extractResults.websearch.question[0] === 'not_needed') {
        return 'No search needed or extraction failed'
      }

      const searchQueries = extractResults.websearch.question
      const searchResults: { query: string; results: any }[] = []

      for (const query of searchQueries) {
        // 构建单个查询的ExtractResults结构
        const queryExtractResults: ExtractResults = {
          websearch: {
            question: [query],
            links: extractResults.websearch.links
          }
        }
        const response = await webSearchService.processWebsearch(queryExtractResults, requestId)
        searchResults.push({
          query,
          results: response
        })
      }

      return { extractedKeywords: extractResults.websearch, searchResults }
    }
  })
}

export type WebSearchToolWithExtractionOutput = InferToolOutput<ReturnType<typeof webSearchToolWithExtraction>>
