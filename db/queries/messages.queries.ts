import { count, eq, sql } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import type { Message } from '@/types/message'

import { db } from '..'
import { transformDbToMessage, transformMessageToDb } from '../mappers'
import { messages } from '../schema'

const logger = loggerService.withContext('DataBase Messages')

/**
 * 插入或更新消息记录
 * @description 在事务中批量处理消息的 upsert 操作，支持单个或数组形式
 * @param messagesToUpsert - 单个消息或消息数组
 * @returns 返回插入或更新后的消息数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertMessages(messagesToUpsert: Message | Message[]): Promise<Message[]> {
  const messagesArray = Array.isArray(messagesToUpsert) ? messagesToUpsert : [messagesToUpsert]
  if (messagesArray.length === 0) return []

  try {
    const dbRecords = messagesArray.map(transformMessageToDb)

    const results = await db.transaction(async tx => {
      if (dbRecords.length === 1) {
        const result = await tx
          .insert(messages)
          .values(dbRecords[0])
          .onConflictDoUpdate({
            target: messages.id,
            set: dbRecords[0]
          })
          .returning()
        return result
      }

      const result = await tx
        .insert(messages)
        .values(dbRecords)
        .onConflictDoUpdate({
          target: messages.id,
          set: {
            role: sql`excluded.role`,
            assistant_id: sql`excluded.assistant_id`,
            topic_id: sql`excluded.topic_id`,
            created_at: sql`excluded.created_at`,
            updated_at: sql`excluded.updated_at`,
            status: sql`excluded.status`,
            model_id: sql`excluded.model_id`,
            model: sql`excluded.model`,
            type: sql`excluded.type`,
            useful: sql`excluded.useful`,
            ask_id: sql`excluded.ask_id`,
            mentions: sql`excluded.mentions`,
            usage: sql`excluded.usage`,
            metrics: sql`excluded.metrics`,
            multi_model_message_style: sql`excluded.multi_model_message_style`,
            fold_selected: sql`excluded.fold_selected`
          }
        })
        .returning()
      return result
    })

    return results.map(transformDbToMessage)
  } catch (error) {
    logger.error('Error upserting message(s):', error)
    throw error
  }
}

/**
 * 根据主题 ID 删除该主题下的所有消息
 * @param topicId - 主题的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteMessagesByTopicId(topicId: string): Promise<void> {
  try {
    await db.delete(messages).where(eq(messages.topic_id, topicId))
  } catch (error) {
    logger.error(`Error deleting messages for topic ID ${topicId}:`, error)
    throw error
  }
}

/**
 * 根据消息 ID 删除指定消息
 * @param messageId - 消息的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteMessageById(messageId: string): Promise<void> {
  try {
    await db.delete(messages).where(eq(messages.id, messageId))
  } catch (error) {
    logger.error(`Error deleting message with ID ${messageId}:`, error)
    throw error
  }
}

/**
 * 删除所有消息记录
 * @description 清空消息表中的所有数据，操作不可逆
 * @throws 当删除操作失败时抛出错误
 */
export async function removeAllMessages() {
  try {
    await db.delete(messages)
  } catch (error) {
    logger.error('Error removing all messages:', error)
    throw error
  }
}

/**
 * 根据消息 ID 更新消息的部分字段
 * @param messageId - 消息的唯一标识符
 * @param updates - 需要更新的字段（部分更新）
 * @returns 如果更新成功则返回更新后的消息对象，否则返回 undefined
 * @throws 当更新操作失败时抛出错误
 */
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

/**
 * 根据消息 ID 获取指定消息
 * @description 使用 Drizzle 关系查询一次性获取消息及其块 ID
 * @param messageId - 消息的唯一标识符
 * @returns 如果找到则返回消息对象（包含块 ID 数组），否则返回 undefined
 * @throws 当查询操作失败时抛出错误
 */
export async function getMessageById(messageId: string): Promise<Message | undefined> {
  try {
    const result = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
      with: {
        blocks: {
          columns: { id: true }
        }
      }
    })

    if (!result) {
      return undefined
    }

    const message = transformDbToMessage(result)
    message.blocks = result.blocks.map(block => block.id)
    return message
  } catch (error) {
    logger.error(`Error getting message by ID ${messageId}:`, error)
    throw error
  }
}

/**
 * 根据主题 ID 获取该主题下的所有消息
 * @description 使用 Drizzle 关系查询一次性获取消息及其块 ID
 * @param topicId - 主题的唯一标识符
 * @returns 返回该主题下的所有消息数组（每条消息包含块 ID 数组）
 * @throws 当查询操作失败时抛出错误
 */
export async function getMessagesByTopicId(topicId: string): Promise<Message[]> {
  try {
    const results = await db.query.messages.findMany({
      where: eq(messages.topic_id, topicId),
      with: {
        blocks: {
          columns: { id: true }
        }
      }
    })

    if (results.length === 0) {
      return []
    }

    return results.map(result => {
      const message = transformDbToMessage(result)
      message.blocks = result.blocks.map(block => block.id)
      return message
    })
  } catch (error) {
    logger.error(`Error getting messages for topic ID ${topicId}:`, error)
    throw error
  }
}

export async function getHasMessagesWithTopicId(topicId: string): Promise<boolean> {
  try {
    const result = await db.select({ count: count() }).from(messages).where(eq(messages.topic_id, topicId))

    return result[0].count > 0
  } catch (error) {
    logger.error(`Error checking if topic ID ${topicId} has messages:`, error)
    throw error
  }
}

export async function getAllMessages(): Promise<Message[]> {
  try {
    const results = await db.query.messages.findMany({
      with: {
        blocks: {
          columns: { id: true }
        }
      }
    })

    if (results.length === 0) {
      return []
    }

    return results.map(result => {
      const message = transformDbToMessage(result)
      message.blocks = result.blocks.map(block => block.id)
      return message
    })
  } catch (error) {
    logger.error(`Error getting all messages:`, error)
    throw error
  }
}
