import { Paths } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'

import { messageDatabase } from '@/database/MessageDatabase'
import { loggerService } from '@/services/LoggerService'
import type { Topic } from '@/types/assistant'
import type { Message } from '@/types/message'
import { removeSpecialCharactersForFileName } from '@/utils/file'
import { getCitationContent, getMainTextContent, getThinkingContent } from '@/utils/messageUtils/find'

import { saveFileToFolder, type ShareFileResult } from '../services/FileService'

const logger = loggerService.withContext('Export')

/**
 * Options for markdown export
 */
export interface MarkdownExportOptions {
  /** Include reasoning/thinking blocks in collapsible details */
  includeReasoning?: boolean
  /** Remove citation markers from content */
  excludeCitations?: boolean
  /** Convert citations to markdown footnote format [^n] */
  normalizeCitations?: boolean
  /** Show model name in message header */
  showModelName?: boolean
  /** Show provider name in message header */
  showModelProvider?: boolean
}

const defaultOptions: MarkdownExportOptions = {
  includeReasoning: false,
  excludeCitations: false,
  normalizeCitations: true,
  showModelName: false,
  showModelProvider: false
}

/**
 * Get role text for markdown header
 */
function getRoleText(
  role: string,
  modelName?: string,
  providerId?: string,
  options?: Pick<MarkdownExportOptions, 'showModelName' | 'showModelProvider'>
): string {
  if (role === 'user') {
    return 'User'
  }

  if (role === 'system') {
    return 'System'
  }

  // Assistant role
  let text = 'Assistant'

  if (options?.showModelName && modelName) {
    text = modelName
    if (options?.showModelProvider && providerId) {
      text += ` | ${providerId}`
    }
  } else if (options?.showModelProvider && providerId) {
    text = `Assistant | ${providerId}`
  }

  return text
}

/**
 * Process citation markers in content
 * @param content - The content to process
 * @param mode - 'remove' to strip citations, 'normalize' to convert to footnote format
 */
export function processCitations(content: string, mode: 'remove' | 'normalize' = 'remove'): string {
  // Match code blocks to preserve them
  const codeBlockRegex = /(```[a-zA-Z]*\n[\s\S]*?\n```)/g
  const parts = content.split(codeBlockRegex)

  const processedParts = parts.map((part, index) => {
    // Code blocks (odd indices) - return as is
    if (index % 2 === 1) {
      return part
    }

    let result = part

    if (mode === 'remove') {
      // Remove various citation marker formats
      result = result
        .replace(/\[<sup[^>]*data-citation[^>]*>\d+<\/sup>\]\([^)]*\)/g, '')
        .replace(/\[<sup[^>]*>\d+<\/sup>\]\([^)]*\)/g, '')
        .replace(/<sup[^>]*data-citation[^>]*>\d+<\/sup>/g, '')
        .replace(/\[(\d+)\](?!\()/g, '')
    } else if (mode === 'normalize') {
      // Normalize to markdown footnote format
      result = result
        .replace(/\[<sup[^>]*data-citation[^>]*>(\d+)<\/sup>\]\([^)]*\)/g, '[^$1]')
        .replace(/\[<sup[^>]*>(\d+)<\/sup>\]\([^)]*\)/g, '[^$1]')
        .replace(/<sup[^>]*data-citation[^>]*>(\d+)<\/sup>/g, '[^$1]')
        .replace(/\[(\d+)\](?!\()/g, '[^$1]')
    }

    // Clean up multiple spaces while preserving markdown structure
    const lines = result.split('\n')
    const processedLines = lines.map(line => {
      // Preserve special markdown lines
      if (line.match(/^>|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s{4,}/)) {
        return line.replace(/[ ]+/g, ' ').replace(/[ ]+$/g, '')
      }
      return line.replace(/[ ]+/g, ' ').trim()
    })

    return processedLines.join('\n')
  })

  return processedParts.join('').trim()
}

/**
 * Format citations as markdown footnotes
 */
function formatCitationsAsFootnotes(citations: string): string {
  if (!citations.trim()) return ''

  const lines = citations.split('\n\n')
  const footnotes = lines.map(line => {
    const match = line.match(/^\[(\d+)\]\s*(.+)/)
    if (match) {
      const [, num, content] = match
      return `[^${num}]: ${content}`
    }
    return line
  })

  return footnotes.join('\n\n')
}

interface MarkdownSections {
  titleSection: string
  reasoningSection: string
  contentSection: string
  citationSection: string
}

/**
 * Create base markdown sections from a message
 */
async function createBaseMarkdown(message: Message, options: MarkdownExportOptions = {}): Promise<MarkdownSections> {
  const opts = { ...defaultOptions, ...options }

  // Build title section
  const roleText = getRoleText(message.role, message.model?.name, message.model?.provider, opts)
  const titleSection = `## ${roleText}`

  // Build reasoning section
  let reasoningSection = ''
  if (opts.includeReasoning) {
    const thinkingContent = await getThinkingContent(message)
    if (thinkingContent) {
      // Clean up thinking content
      let cleanedContent = thinkingContent
      if (cleanedContent.startsWith('<think>\n')) {
        cleanedContent = cleanedContent.substring(8)
      } else if (cleanedContent.startsWith('<think>')) {
        cleanedContent = cleanedContent.substring(7)
      }
      if (cleanedContent.endsWith('</think>')) {
        cleanedContent = cleanedContent.substring(0, cleanedContent.length - 8)
      }

      reasoningSection = `<details>
<summary>Reasoning</summary>

${cleanedContent.trim()}

</details>
`
    }
  }

  // Build content section
  const mainContent = await getMainTextContent(message)
  let contentSection = mainContent

  // Build citation section
  let citationSection = ''
  if (!opts.excludeCitations) {
    const citations = await getCitationContent(message)
    if (opts.normalizeCitations) {
      contentSection = processCitations(mainContent, 'normalize')
      citationSection = formatCitationsAsFootnotes(citations)
    } else {
      citationSection = citations
    }
  } else {
    contentSection = processCitations(mainContent, 'remove')
  }

  return {
    titleSection,
    reasoningSection,
    contentSection,
    citationSection
  }
}

/**
 * Convert a single message to markdown (without reasoning)
 */
export async function messageToMarkdown(message: Message, options?: MarkdownExportOptions): Promise<string> {
  const { titleSection, contentSection, citationSection } = await createBaseMarkdown(message, {
    ...options,
    includeReasoning: false
  })

  const parts = [titleSection, '', contentSection]
  if (citationSection) {
    parts.push('', citationSection)
  }

  return parts.join('\n')
}

/**
 * Convert a single message to markdown with reasoning
 */
export async function messageToMarkdownWithReasoning(
  message: Message,
  options?: MarkdownExportOptions
): Promise<string> {
  const { titleSection, reasoningSection, contentSection, citationSection } = await createBaseMarkdown(message, {
    ...options,
    includeReasoning: true
  })

  const parts = [titleSection, '']
  if (reasoningSection) {
    parts.push(reasoningSection)
  }
  parts.push(contentSection)
  if (citationSection) {
    parts.push('', citationSection)
  }

  return parts.join('\n')
}

/**
 * Convert multiple messages to markdown
 */
export async function messagesToMarkdown(messages: Message[], options?: MarkdownExportOptions): Promise<string> {
  const markdownParts: string[] = []

  for (const message of messages) {
    const markdown = options?.includeReasoning
      ? await messageToMarkdownWithReasoning(message, options)
      : await messageToMarkdown(message, options)
    markdownParts.push(markdown)
  }

  return markdownParts.join('\n\n---\n\n')
}

/**
 * Convert a topic to markdown
 */
export async function topicToMarkdown(topic: Topic, options?: MarkdownExportOptions): Promise<string> {
  const topicTitle = `# ${topic.name}`

  const messages = await messageDatabase.getMessagesByTopicId(topic.id)

  if (messages && messages.length > 0) {
    const messagesMarkdown = await messagesToMarkdown(messages, options)
    return `${topicTitle}\n\n${messagesMarkdown}`
  }

  return topicTitle
}

/**
 * Export a topic as a markdown file
 * On Android: Opens directory picker for user to choose save location
 * On iOS: Opens share sheet
 */
export async function exportTopicAsMarkdown(topic: Topic, options?: MarkdownExportOptions): Promise<ShareFileResult> {
  try {
    const markdown = await topicToMarkdown(topic, options)
    const fileName = removeSpecialCharactersForFileName(topic.name) + '.md'

    // Write to temp file with proper filename (important for iOS share sheet)
    const tempUri = `${Paths.cache.uri}${fileName}`
    await FileSystem.writeAsStringAsync(tempUri, markdown, {
      encoding: FileSystem.EncodingType.UTF8
    })

    // Save using platform-specific method
    const result = await saveFileToFolder(tempUri, fileName, 'text/markdown')

    // Clean up temp file
    try {
      await FileSystem.deleteAsync(tempUri, { idempotent: true })
    } catch {
      // Ignore cleanup errors
    }

    if (result.success) {
      logger.info('Topic exported successfully', { topicId: topic.id, fileName })
    } else if (result.message !== 'cancelled') {
      logger.warn('Topic export failed', { topicId: topic.id, message: result.message })
    }

    return result
  } catch (error) {
    logger.error('Failed to export topic as markdown', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Export a single message as a markdown file
 */
export async function exportMessageAsMarkdown(
  message: Message,
  title: string,
  options?: MarkdownExportOptions
): Promise<ShareFileResult> {
  try {
    const markdown = options?.includeReasoning
      ? await messageToMarkdownWithReasoning(message, options)
      : await messageToMarkdown(message, options)

    const fileName = removeSpecialCharactersForFileName(title) + '.md'

    // Write to temp file with proper filename (important for iOS share sheet)
    const tempUri = `${Paths.cache.uri}${fileName}`
    await FileSystem.writeAsStringAsync(tempUri, markdown, {
      encoding: FileSystem.EncodingType.UTF8
    })

    // Save using platform-specific method
    const result = await saveFileToFolder(tempUri, fileName, 'text/markdown')

    // Clean up temp file
    try {
      await FileSystem.deleteAsync(tempUri, { idempotent: true })
    } catch {
      // Ignore cleanup errors
    }

    if (result.success) {
      logger.info('Message exported successfully', { messageId: message.id, fileName })
    } else if (result.message !== 'cancelled') {
      logger.warn('Message export failed', { messageId: message.id, message: result.message })
    }

    return result
  } catch (error) {
    logger.error('Failed to export message as markdown', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get a title from message content (for file naming)
 */
export function getTitleFromContent(content: string, maxLength: number = 80): string {
  let title = content.trimStart().split('\n')[0]

  // Try to find a natural break point
  const breakChars = ['。', '，', '.', ',']
  for (const char of breakChars) {
    if (title.includes(char)) {
      title = title.split(char)[0]
      break
    }
  }

  // Truncate if still too long
  if (title.length > maxLength) {
    title = title.slice(0, maxLength)
  }

  // Fallback to raw slice
  if (!title) {
    title = content.slice(0, maxLength)
  }

  return title.trim() || 'Untitled'
}
