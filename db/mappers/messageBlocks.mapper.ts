import type { InferInsertModel } from 'drizzle-orm'

import type {
  CitationMessageBlock,
  CodeMessageBlock,
  FileMessageBlock,
  ImageMessageBlock,
  MainTextMessageBlock,
  MessageBlock,
  MessageBlockStatus,
  ThinkingMessageBlock,
  ToolMessageBlock,
  TranslationMessageBlock
} from '@/types/message'
import { MessageBlockType } from '@/types/message'

import type { messageBlocks } from '../schema'

type MessageBlockDbInsert = InferInsertModel<typeof messageBlocks>

export function transformPartialMessageBlockToDb(changes: Partial<MessageBlock>): Partial<MessageBlockDbInsert> {
  const dbChanges: Partial<MessageBlockDbInsert> = {}

  for (const key in changes) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue

    // The switch operates on the string `key`.
    switch (key) {
      // --- Base fields (accessible on `changes` directly) ---
      case 'messageId':
        dbChanges.message_id = changes.messageId
        break
      case 'type':
        dbChanges.type = changes.type
        break
      case 'createdAt':
        dbChanges.created_at = changes.createdAt ? new Date(changes.createdAt).getTime() : undefined
        break
      case 'updatedAt':
        dbChanges.updated_at = changes.updatedAt ? new Date(changes.updatedAt).getTime() : undefined
        break
      case 'status':
        dbChanges.status = changes.status
        break
      case 'model':
        dbChanges.model = changes.model ? JSON.stringify(changes.model) : null
        break
      case 'metadata':
        dbChanges.metadata = changes.metadata ? JSON.stringify(changes.metadata) : null
        break
      case 'error':
        dbChanges.error = changes.error ? JSON.stringify(changes.error) : null
        break

      // --- Type-specific fields (require casting) ---
      case 'content': {
        // 'content' can be a string or an object (for ToolBlock).
        // We cast to a union of all types that have a 'content' property.
        const content = (
          changes as Partial<
            MainTextMessageBlock | ThinkingMessageBlock | TranslationMessageBlock | CodeMessageBlock | ToolMessageBlock
          >
        ).content

        if (typeof content === 'object' && content !== null) {
          dbChanges.content = JSON.stringify(content)
        } else {
          dbChanges.content = content as string | null
        }

        break
      }

      case 'knowledgeBaseIds':
        dbChanges.knowledge_base_ids = (changes as Partial<MainTextMessageBlock>).knowledgeBaseIds
          ? JSON.stringify((changes as Partial<MainTextMessageBlock>).knowledgeBaseIds)
          : null
        break
      case 'citationReferences':
        dbChanges.citation_references = (changes as Partial<MainTextMessageBlock>).citationReferences
          ? JSON.stringify((changes as Partial<MainTextMessageBlock>).citationReferences)
          : null
        break
      case 'thinking_millsec':
        dbChanges.thinking_millsec = (changes as Partial<ThinkingMessageBlock>).thinking_millsec ?? null
        break
      case 'language':
        dbChanges.language = (changes as Partial<CodeMessageBlock>).language
        break
      case 'url':
        dbChanges.url = (changes as Partial<ImageMessageBlock>).url
        break
      case 'file': {
        // 'file' exists on ImageMessageBlock and FileMessageBlock
        const file = (changes as Partial<ImageMessageBlock | FileMessageBlock>).file
        dbChanges.file = file ? JSON.stringify(file) : null
        break
      }
      case 'toolId':
        dbChanges.tool_id = (changes as Partial<ToolMessageBlock>).toolId
        break
      case 'toolName':
        dbChanges.tool_name = (changes as Partial<ToolMessageBlock>).toolName
        break
      case 'arguments': {
        const args = (changes as Partial<ToolMessageBlock>).arguments
        dbChanges.arguments = args ? JSON.stringify(args) : null
        break
      }
      case 'sourceBlockId':
        dbChanges.source_block_id = (changes as Partial<TranslationMessageBlock>).sourceBlockId
        break
      case 'response': {
        const response = (changes as Partial<CitationMessageBlock>).response
        dbChanges.response = response ? JSON.stringify(response) : null
        break
      }
      case 'knowledge': {
        const knowledge = (changes as Partial<CitationMessageBlock>).knowledge
        dbChanges.knowledge = knowledge ? JSON.stringify(knowledge) : null
        break
      }

      // 'id' is the primary key and typically shouldn't be updated.
      case 'id':
        break

      default:
        break
    }
  }

  return dbChanges
}

// 数据库记录转换为 MessageBlock 类型
export function transformDbToMessageBlock(dbRecord: any): MessageBlock {
  const base = {
    id: dbRecord.id,
    messageId: dbRecord.message_id,
    type: dbRecord.type as MessageBlockType,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    status: dbRecord.status as MessageBlockStatus,
    model: dbRecord.model ? JSON.parse(dbRecord.model) : undefined,
    metadata: dbRecord.metadata ? JSON.parse(dbRecord.metadata) : undefined,
    error: dbRecord.error ? JSON.parse(dbRecord.error) : undefined
  }

  // 根据类型添加特定字段并返回正确的类型
  switch (base.type) {
    case MessageBlockType.MAIN_TEXT:
      return {
        ...base,
        type: MessageBlockType.MAIN_TEXT,
        content: dbRecord.content || '',
        knowledgeBaseIds: dbRecord.knowledge_base_ids ? JSON.parse(dbRecord.knowledge_base_ids) : undefined,
        citationReferences: dbRecord.citation_references ? JSON.parse(dbRecord.citation_references) : undefined
      }

    case MessageBlockType.THINKING:
      return {
        ...base,
        type: MessageBlockType.THINKING,
        content: dbRecord.content || '',
        thinking_millsec: dbRecord.thinking_millsec || undefined
      }

    case MessageBlockType.CODE:
      return {
        ...base,
        type: MessageBlockType.CODE,
        content: dbRecord.content || '',
        language: dbRecord.language || 'text'
      }

    case MessageBlockType.IMAGE:
      return {
        ...base,
        type: MessageBlockType.IMAGE,
        url: dbRecord.url || undefined,
        file: dbRecord.file ? JSON.parse(dbRecord.file) : undefined
      }

    case MessageBlockType.TOOL:
      return {
        ...base,
        type: MessageBlockType.TOOL,
        toolId: dbRecord.tool_id || '',
        toolName: dbRecord.tool_name || undefined,
        arguments: dbRecord.arguments ? JSON.parse(dbRecord.arguments) : undefined,
        content: dbRecord.content
          ? // 尝试解析为对象，如果失败则保持为字符串
            (() => {
              try {
                return JSON.parse(dbRecord.content)
              } catch {
                return dbRecord.content
              }
            })()
          : undefined
      }

    case MessageBlockType.TRANSLATION:
      return {
        ...base,
        type: MessageBlockType.TRANSLATION,
        content: dbRecord.content || '',
        sourceBlockId: dbRecord.source_block_id || undefined
      }

    case MessageBlockType.CITATION:
      return {
        ...base,
        type: MessageBlockType.CITATION,
        response: dbRecord.response ? JSON.parse(dbRecord.response) : undefined,
        knowledge: dbRecord.knowledge ? JSON.parse(dbRecord.knowledge) : undefined
      }

    case MessageBlockType.FILE:
      return {
        ...base,
        type: MessageBlockType.FILE,
        file: dbRecord.file ? JSON.parse(dbRecord.file) : { id: '', name: '', path: '', size: 0, type: '', ext: '' }
      }

    case MessageBlockType.ERROR:
      return {
        ...base,
        type: MessageBlockType.ERROR
      }

    case MessageBlockType.UNKNOWN:
    default:
      return {
        ...base,
        type: MessageBlockType.UNKNOWN
      }
  }
}

// MessageBlock 转换为数据库记录
export function transformMessageBlockToDb(messageBlock: MessageBlock): any {
  const base = {
    id: messageBlock.id,
    message_id: messageBlock.messageId,
    type: messageBlock.type,
    created_at: new Date(messageBlock.createdAt).getTime(),
    updated_at: messageBlock.updatedAt ? new Date(messageBlock.updatedAt).getTime() : null,
    status: messageBlock.status,
    model: messageBlock.model ? JSON.stringify(messageBlock.model) : null,
    metadata: messageBlock.metadata ? JSON.stringify(messageBlock.metadata) : null,
    error: messageBlock.error ? JSON.stringify(messageBlock.error) : null
  }

  // 根据类型添加特定字段
  switch (messageBlock.type) {
    case MessageBlockType.MAIN_TEXT:
      return {
        ...base,
        content: messageBlock.content,
        knowledge_base_ids: messageBlock.knowledgeBaseIds ? JSON.stringify(messageBlock.knowledgeBaseIds) : null,
        citation_references: messageBlock.citationReferences ? JSON.stringify(messageBlock.citationReferences) : null
      }

    case MessageBlockType.THINKING:
      return {
        ...base,
        content: messageBlock.content,
        thinking_millsec: messageBlock.thinking_millsec || null
      }

    case MessageBlockType.CODE:
      return {
        ...base,
        content: messageBlock.content,
        language: messageBlock.language
      }

    case MessageBlockType.IMAGE:
      return {
        ...base,
        url: messageBlock.url || null,
        file: messageBlock.file ? JSON.stringify(messageBlock.file) : null
      }

    case MessageBlockType.TOOL:
      return {
        ...base,
        tool_id: messageBlock.toolId,
        tool_name: messageBlock.toolName || null,
        arguments: messageBlock.arguments ? JSON.stringify(messageBlock.arguments) : null,
        content: typeof messageBlock.content === 'object' ? JSON.stringify(messageBlock.content) : messageBlock.content
      }

    case MessageBlockType.TRANSLATION:
      return {
        ...base,
        content: messageBlock.content,
        source_block_id: messageBlock.sourceBlockId || null
      }

    case MessageBlockType.CITATION:
      return {
        ...base,
        response: messageBlock.response ? JSON.stringify(messageBlock.response) : null,
        knowledge: messageBlock.knowledge ? JSON.stringify(messageBlock.knowledge) : null
      }

    case MessageBlockType.FILE:
      return {
        ...base,
        file: JSON.stringify(messageBlock.file)
      }

    default:
      return base
  }
}
