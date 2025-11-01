import type { WebSearchResultBlock } from '@anthropic-ai/sdk/resources'
import type { GroundingMetadata } from '@google/genai'
import type OpenAI from 'openai'

import type { CitationMessageBlock, Message } from '@/types/message'
import type { Citation, WebSearchProviderResponse } from '@/types/websearch'
import { WebSearchSource } from '@/types/websearch'

import { findImageBlocks } from './messageUtils/find'

export function formateEmoji(emoji?: string) {
  if (!emoji) return ''
  return emoji.replace(/\r\n/g, '').trim()
}

export async function addImageFileToContents(messages: Message[]) {
  const lastAssistantMessage = messages.findLast(m => m.role === 'assistant')
  if (!lastAssistantMessage) return messages
  const blocks = await findImageBlocks(lastAssistantMessage)
  if (!blocks || blocks.length === 0) return messages

  if (blocks.every(v => !v.metadata?.generateImage)) {
    return messages
  }

  const imageFiles = blocks.map(v => v.metadata?.generateImage?.images).flat()
  const updatedAssistantMessage = {
    ...lastAssistantMessage,
    images: imageFiles
  }

  return messages.map(message => (message.id === lastAssistantMessage.id ? updatedAssistantMessage : message))
}

export function removeSvgEmptyLines(text: string): string {
  // 用正则表达式匹配 <svg> 标签内的内容
  const svgPattern = /(<svg[\s\S]*?<\/svg>)/g

  return text.replace(svgPattern, svgMatch => {
    // 将 SVG 内容按行分割,过滤掉空行,然后重新组合
    return svgMatch
      .split('\n')
      .filter(line => line.trim() !== '')
      .join('\n')
  })
}

export function escapeBrackets(text: string) {
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\]|\\\((.*?)\\\)/g
  return text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock
    } else if (squareBracket) {
      return `$$${squareBracket}$$`
    } else if (roundBracket) {
      return `$${roundBracket}$`
    }

    return match
  })
}

// --- Centralized Citation Formatting Logic ---
export const formatCitationsFromBlock = (block: CitationMessageBlock | undefined): Citation[] => {
  if (!block) return []

  let formattedCitations: Citation[] = []

  // 1. Handle Web Search Responses
  if (block.response) {
    switch (block.response.source) {
      case WebSearchSource.GEMINI: {
        const groundingMetadata = block.response.results as GroundingMetadata
        formattedCitations =
          groundingMetadata?.groundingChunks?.map((chunk, index) => ({
            number: index + 1,
            url: chunk?.web?.uri || '',
            title: chunk?.web?.title,
            showFavicon: true,
            metadata: groundingMetadata.groundingSupports,
            type: 'websearch'
          })) || []
        break
      }

      case WebSearchSource.OPENAI_RESPONSE:
        formattedCitations =
          (block.response.results as OpenAI.Responses.ResponseOutputText.URLCitation[])?.map((result, index) => {
            let hostname: string | undefined

            try {
              hostname = result.title ? undefined : new URL(result.url).hostname
            } catch {
              hostname = result.url
            }

            return {
              number: index + 1,
              url: result.url,
              title: result.title,
              hostname: hostname,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break
      case WebSearchSource.OPENAI:
        formattedCitations =
          (block.response.results as OpenAI.Chat.Completions.ChatCompletionMessage.Annotation[])?.map((url, index) => {
            const urlCitation = url.url_citation
            let hostname: string | undefined

            try {
              hostname = urlCitation.title ? undefined : new URL(urlCitation.url).hostname
            } catch {
              hostname = urlCitation.url
            }

            return {
              number: index + 1,
              url: urlCitation.url,
              title: urlCitation.title,
              hostname: hostname,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break
      case WebSearchSource.ANTHROPIC:
        formattedCitations =
          (block.response.results as WebSearchResultBlock[])?.map((result, index) => {
            const { url } = result
            let hostname: string | undefined

            try {
              hostname = new URL(url).hostname
            } catch {
              hostname = url
            }

            return {
              number: index + 1,
              url: url,
              title: result.title,
              hostname: hostname,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break

      case WebSearchSource.PERPLEXITY: {
        formattedCitations =
          (block.response.results as any[])?.map((result, index) => ({
            number: index + 1,
            url: result.url || result, // 兼容旧数据
            title: result.title || new URL(result).hostname, // 兼容旧数据
            showFavicon: true,
            type: 'websearch'
          })) || []
        break
      }

      case WebSearchSource.GROK:
      case WebSearchSource.OPENROUTER:
        formattedCitations =
          (block.response.results as any[])?.map((url, index) => {
            try {
              const hostname = new URL(url).hostname
              return {
                number: index + 1,
                url,
                hostname,
                showFavicon: true,
                type: 'websearch'
              }
            } catch {
              return {
                number: index + 1,
                url,
                hostname: url,
                showFavicon: true,
                type: 'websearch'
              }
            }
          }) || []
        break
      case WebSearchSource.ZHIPU:
      case WebSearchSource.HUNYUAN:
        formattedCitations =
          (block.response.results as any[])?.map((result, index) => ({
            number: index + 1,
            url: result.link || result.url,
            title: result.title,
            showFavicon: true,
            type: 'websearch'
          })) || []
        break
      case WebSearchSource.WEBSEARCH:
        formattedCitations =
          (block.response.results as WebSearchProviderResponse)?.results?.map((result, index) => ({
            number: index + 1,
            url: result.url,
            title: result.title,
            content: result.content,
            showFavicon: true,
            type: 'websearch'
          })) || []
        break
      case WebSearchSource.AISDK:
        formattedCitations =
          (block.response.results as any[])?.map((result, index) => ({
            number: index + 1,
            url: result.url,
            title: result.title,
            providerMetadata: result?.providerMetadata
          })) || []
        break
    }
  }

  // 3. Handle Knowledge Base References
  if (block.knowledge && block.knowledge.length > 0) {
    formattedCitations.push(
      ...block.knowledge.map((result, index) => {
        const filePattern = /\[(.*?)]\(http:\/\/file\/(.*?)\)/
        const fileMatch = result.sourceUrl.match(filePattern)

        let url = result.sourceUrl
        let title = result.sourceUrl
        const showFavicon = true

        // 如果匹配文件链接格式 [filename](http://file/xxx)
        if (fileMatch) {
          title = fileMatch[1]
          url = `http://file/${fileMatch[2]}`
        }

        return {
          number: index + 1,
          url: url,
          title: title,
          content: result.content,
          showFavicon: showFavicon,
          type: 'knowledge'
        }
      })
    )
  }

  // 4. Deduplicate non-knowledge citations by URL and Renumber Sequentially
  const urlSet = new Set<string>()
  return formattedCitations
    .filter(citation => {
      if (citation.type === 'knowledge' || citation.type === 'memory') return true
      if (!citation.url || urlSet.has(citation.url)) return false
      urlSet.add(citation.url)
      return true
    })
    .map((citation, index) => ({
      ...citation,
      number: index + 1
    }))
}
// --- End of Centralized Logic ---
