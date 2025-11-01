import { messageBlockDatabase } from '@database'

import type { FileMetadata } from '@/types/file'
import {
  type CitationMessageBlock,
  type FileMessageBlock,
  type ImageMessageBlock,
  type MainTextMessageBlock,
  type Message,
  type MessageBlock,
  MessageBlockType,
  type ThinkingMessageBlock,
  type TranslationMessageBlock
} from '@/types/message'

export const findAllBlocks = async (message: Message): Promise<MessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const allBlocks: MessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block) {
      allBlocks.push(block)
    }
  }

  return allBlocks
}

/**
 * Finds all MainTextMessageBlocks associated with a given message, in order.
 * @param message - The message object.
 * @returns An array of MainTextMessageBlocks (empty if none found).
 */
export const findMainTextBlocks = async (message: Message): Promise<MainTextMessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const textBlocks: MainTextMessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block && block.type === MessageBlockType.MAIN_TEXT) {
      textBlocks.push(block as MainTextMessageBlock)
    }
  }

  return textBlocks
}

/**
 * Finds all ThinkingMessageBlocks associated with a given message.
 * @param message - The message object.
 * @returns An array of ThinkingMessageBlocks (empty if none found).
 */
export const findThinkingBlocks = async (message: Message): Promise<ThinkingMessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const thinkingBlocks: ThinkingMessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block && block.type === MessageBlockType.THINKING) {
      thinkingBlocks.push(block as ThinkingMessageBlock)
    }
  }

  return thinkingBlocks
}

/**
 * Finds all ImageMessageBlocks associated with a given message.
 * @param message - The message object.
 * @returns An array of ImageMessageBlocks (empty if none found).
 */
export const findImageBlocks = async (message: Message): Promise<ImageMessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const imageBlocks: ImageMessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block && block.type === MessageBlockType.IMAGE) {
      imageBlocks.push(block as ImageMessageBlock)
    }
  }

  return imageBlocks
}

/**
 * Finds all FileMessageBlocks associated with a given message.
 * @param message - The message object.
 * @returns An array of FileMessageBlocks (empty if none found).
 */
export const findFileBlocks = async (message: Message): Promise<FileMessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const fileBlocks: FileMessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block && block.type === MessageBlockType.FILE) {
      fileBlocks.push(block as FileMessageBlock)
    }
  }

  return fileBlocks
}

/**
 * Gets the concatenated content string from all MainTextMessageBlocks of a message, in order.
 * @param message - The message object.
 * @returns The concatenated content string or an empty string if no text blocks are found.
 */
export const getMainTextContent = async (message: Message): Promise<string> => {
  const textBlocks = await findMainTextBlocks(message)
  return textBlocks.map(block => block.content).join('\n\n')
}

/**
 * Gets the concatenated content string from all ThinkingMessageBlocks of a message, in order.
 * @param message
 * @returns The concatenated content string or an empty string if no thinking blocks are found.
 */
export const getThinkingContent = async (message: Message): Promise<string> => {
  const thinkingBlocks = await findThinkingBlocks(message)
  return thinkingBlocks.map(block => block.content).join('\n\n')
}

export const getCitationContent = async (message: Message): Promise<string> => {
  const citationBlocks = await findCitationBlocks(message)
  const citations: string[] = []

  citationBlocks.forEach(block => {
    // Handle web search results
    if (block.response?.results) {
      const results = block.response.results as any

      // Handle different types of results based on the union type
      if (Array.isArray(results)) {
        results.forEach((result: any, index: number) => {
          if (result.title && result.url) {
            citations.push(`[${index + 1}] [${result.title}](${result.url})`)
          }
        })
      } else if (results.results && Array.isArray(results.results)) {
        results.results.forEach((result: any, index: number) => {
          if (result.title && result.url) {
            citations.push(`[${index + 1}] [${result.title}](${result.url})`)
          }
        })
      }
    }

    // Handle knowledge base references
    if (block.knowledge) {
      block.knowledge.forEach((ref, index) => {
        const displayText = ref.file?.name || ref.sourceUrl || ref.content?.substring(0, 50) + '...'
        citations.push(`[${index + 1}] ${displayText}`)
      })
    }
  })

  return citations.join('\n\n')
}

/**
 * Gets the knowledgeBaseIds array from the *first* MainTextMessageBlock of a message.
 * Note: Assumes knowledgeBaseIds are only relevant on the first text block, adjust if needed.
 * @param message - The message object.
 * @returns The knowledgeBaseIds array or undefined if not found.
 */
export const getKnowledgeBaseIds = async (message: Message): Promise<string[] | undefined> => {
  const textBlocks = await findMainTextBlocks(message)
  return textBlocks?.flatMap(block => block.knowledgeBaseIds).filter((id): id is string => Boolean(id))
}

/**
 * Gets the file content from all FileMessageBlocks and ImageMessageBlocks of a message.
 * @param message - The message object.
 * @returns The file content or an empty string if no file blocks are found.
 */
export const getFileContent = async (message: Message): Promise<FileMetadata[]> => {
  const files: FileMetadata[] = []
  const fileBlocks = await findFileBlocks(message)

  for (const block of fileBlocks) {
    if (block.file) {
      files.push(block.file)
    }
  }

  const imageBlocks = await findImageBlocks(message)

  for (const block of imageBlocks) {
    if (block.file) {
      files.push(block.file)
    }
  }

  return files
}

/**
 * Finds all CitationBlocks associated with a given message.
 * @param message - The message object.
 * @returns An array of CitationBlocks (empty if none found).
 */
export const findCitationBlocks = async (message: Message): Promise<CitationMessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const citationBlocks: CitationMessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block && block.type === MessageBlockType.CITATION) {
      citationBlocks.push(block as CitationMessageBlock)
    }
  }

  return citationBlocks
}

/**
 * Finds all TranslationMessageBlocks associated with a given message.
 * @param message - The message object.
 * @returns An array of TranslationMessageBlocks (empty if none found).
 */
export const findTranslationBlocks = async (message: Message): Promise<TranslationMessageBlock[]> => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return []
  }

  const translationBlocks: TranslationMessageBlock[] = []

  for (const blockId of message.blocks) {
    const block = await messageBlockDatabase.getBlockById(blockId)

    if (block && block.type === MessageBlockType.TRANSLATION) {
      translationBlocks.push(block as TranslationMessageBlock)
    }
  }

  return translationBlocks
}

/**
 * Finds the WebSearchMessageBlock associated with a given message.
 * Assumes only one web search block per message.
 * @param message - The message object.
 * @returns The WebSearchMessageBlock or undefined if not found.
 * @deprecated Web search results are now part of CitationMessageBlock.
 */
/* // Removed function
export const findWebSearchBlock = (message: Message): WebSearchMessageBlock | undefined => {
  if (!message || !message.blocks || message.blocks.length === 0) {
    return undefined
  }
  const state = store.getState()
  for (const blockId of message.blocks) {
    const block = messageBlocksSelectors.selectById(state, blockId)
    if (block && block.type === MessageBlockType.WEB_SEARCH) { // Error here too
      return block as WebSearchMessageBlock
    }
  }
  return undefined
}
*/

// You can add more helper functions here to find other block types if needed.
