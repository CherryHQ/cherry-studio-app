import { eq } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import { Message } from '@/types/message'
import { safeJsonParse } from '@/utils/json'

import { db } from '..'
import { messages } from '../schema'
import { getBlocksIdByMessageId } from './messageBlocks.queries'
const logger = loggerService.withContext('DataBase Messages')

/**
 * 将数据库记录转换为 Message 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 Message 对象。
 */
export function transformDbToMessage(dbRecord: any): Message {
  return {
    id: dbRecord.id,
    role: dbRecord.role,
    assistantId: dbRecord.assistant_id,
    topicId: dbRecord.topic_id,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    status: dbRecord.status,
    modelId: dbRecord.model_id,
    model: dbRecord.model ? safeJsonParse(dbRecord.model) : undefined,
    type: dbRecord.type,
    useful: !!dbRecord.useful,
    askId: dbRecord.ask_id,
    mentions: dbRecord.mentions ? safeJsonParse(dbRecord.mentions) : undefined,
    usage: dbRecord.usage ? safeJsonParse(dbRecord.usage) : undefined,
    metrics: dbRecord.metrics ? safeJsonParse(dbRecord.metrics) : undefined,
    multiModelMessageStyle: dbRecord.multi_model_message_style,
    foldSelected: !!dbRecord.fold_selected,
    // 注意：'blocks' 字段需要通过查询 message_blocks 表来单独填充。
    blocks: []
  }
}

/**
 * 将 Message 对象转换为数据库记录格式。
 * 注意：此函数不处理 'blocks' 属性，因为块存储在单独的表中。
 * @param message - Message 对象。
 * @returns 一个适合数据库操作的对象。
 */
function transformMessageToDb(message: Partial<Message>): any {
  const dbRecord: any = {}

  if (message.id !== undefined) dbRecord.id = message.id
  if (message.role !== undefined) dbRecord.role = message.role
  if (message.assistantId !== undefined) dbRecord.assistant_id = message.assistantId
  if (message.topicId !== undefined) dbRecord.topic_id = message.topicId
  if (message.createdAt !== undefined) dbRecord.created_at = message.createdAt
  if (message.updatedAt !== undefined) dbRecord.updated_at = message.updatedAt
  if (message.status !== undefined) dbRecord.status = message.status
  if (message.modelId !== undefined) dbRecord.model_id = message.modelId
  if (message.type !== undefined) dbRecord.type = message.type
  if (message.askId !== undefined) dbRecord.ask_id = message.askId
  if (message.multiModelMessageStyle !== undefined) dbRecord.multi_model_message_style = message.multiModelMessageStyle

  if (message.useful !== undefined) {
    dbRecord.useful = message.useful ? 1 : 0
  }

  if (message.foldSelected !== undefined) {
    dbRecord.fold_selected = message.foldSelected ? 1 : 0
  }

  if (message.model !== undefined) {
    dbRecord.model = message.model ? JSON.stringify(message.model) : null
  }

  if (message.mentions !== undefined) {
    dbRecord.mentions = message.mentions ? JSON.stringify(message.mentions) : null
  }

  if (message.usage !== undefined) {
    dbRecord.usage = message.usage ? JSON.stringify(message.usage) : null
  }

  if (message.metrics !== undefined) {
    dbRecord.metrics = message.metrics ? JSON.stringify(message.metrics) : null
  }

  return dbRecord
}

/**
 * 根据 ID 获取单个消息。
 * @param messageId - 要获取的消息的 ID。
 * @returns 一个 Message 对象，如果未找到则返回 undefined。
 */
export async function getMessageById(messageId: string): Promise<Message | undefined> {
  try {
    const result = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1)

    if (result.length === 0) {
      return undefined
    }

    const blocks = await getBlocksIdByMessageId(messageId)
    const message = transformDbToMessage(result[0])
    message.blocks = blocks
    return message
  } catch (error) {
    logger.error(`Error getting message by ID ${messageId}:`, error)
    throw error
  }
}

/**
 * 获取给定主题 ID 的所有消息。
 * @param topicId - 主题的 ID。
 * @returns 一组 Message 对象。
 */
export async function getMessagesByTopicId(topicId: string): Promise<Message[]> {
  try {
    const results = await db.select().from(messages).where(eq(messages.topic_id, topicId))

    if (results.length === 0) {
      return []
    }

    const messagesResult = results.map(transformDbToMessage)
    // 获取所有消息的块 ID
    const blocksPromises = messagesResult.map(message => getBlocksIdByMessageId(message.id))
    const blocksResults = await Promise.all(blocksPromises)

    // 将每个消息的块 ID 填充到对应的消息对象中
    for (let i = 0; i < messagesResult.length; i++) {
      messagesResult[i].blocks = blocksResults[i]
    }

    return messagesResult
  } catch (error) {
    logger.error(`Error getting messages for topic ID ${topicId}:`, error)
    throw error
  }
}

/**
 * 插入或更新一个或多个消息 (Upsert)。
 * @param messagesToUpsert - 要插入或更新的 Message 对象或对象数组。
 * @returns 包含已更新或插入的消息的数组的 Promise。
 */
export async function upsertMessages(messagesToUpsert: Message | Message[]): Promise<Message[]> {
  const messagesArray = Array.isArray(messagesToUpsert) ? messagesToUpsert : [messagesToUpsert]
  if (messagesArray.length === 0) return []

  try {
    const dbRecords = messagesArray.map(transformMessageToDb)

    // 为每个记录创建一个 upsert promise
    const upsertPromises = dbRecords.map(record =>
      db
        .insert(messages)
        .values(record)
        .onConflictDoUpdate({
          target: messages.id,
          set: record // 更新除主键外的所有字段
        })
        .returning()
    )

    const results = await Promise.all(upsertPromises)
    const flattenedResults = results.flat() // .returning() 为每个 promise 返回一个数组，因此需要展平

    return flattenedResults.map(transformDbToMessage)
  } catch (error) {
    logger.error('Error upserting message(s):', error)
    throw error
  }
}

export async function removeAllMessages() {
  try {
    await db.delete(messages)
  } catch (error) {
    logger.error('Error removing all messages:', error)
    throw error
  }
}

export async function updateMessageById(messageId: string, updates: Partial<Message>): Promise<Message | undefined> {
  try {
    const dbRecord = transformMessageToDb(updates)
    const result = await db.update(messages).set(dbRecord).where(eq(messages.id, messageId)).returning()

    if (result.length === 0) {
      return undefined
    }

    return transformDbToMessage(result[0])
  } catch (error) {
    logger.error(`Error updating message with ID ${messageId}:`, error)
    throw error
  }
}
