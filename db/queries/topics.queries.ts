import { desc, eq } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import type { Topic } from '@/types/assistant'

import { db } from '..'
import { transformDbToTopic, transformTopicToDb } from '../mappers'
import { topics } from '../schema'

const logger = loggerService.withContext('DataBase Topics')

/**
 * 插入或更新主题记录
 * @description 在事务中批量处理主题的 upsert 操作，支持单个或数组形式
 * @param topicsToUpsert - 单个主题或主题数组
 * @returns 返回插入或更新后的主题数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertTopics(topicsToUpsert: Topic | Topic[]): Promise<Topic[]> {
  const topicsArray = Array.isArray(topicsToUpsert) ? topicsToUpsert : [topicsToUpsert]
  if (topicsArray.length === 0) return []

  try {
    const dbRecords = topicsArray.map(transformTopicToDb)

    const results = await db.transaction(async tx => {
      const upsertPromises = dbRecords.map(record =>
        tx
          .insert(topics)
          .values(record)
          .onConflictDoUpdate({
            target: topics.id,
            set: record
          })
          .returning()
      )

      const transactionResults = await Promise.all(upsertPromises)
      return transactionResults.flat()
    })

    return results.map(transformDbToTopic)
  } catch (error) {
    logger.error('Error upserting topic(s):', error)
    throw error
  }
}

/**
 * 根据 ID 删除指定主题
 * @param topicId - 主题的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteTopicById(topicId: string): Promise<void> {
  try {
    await db.delete(topics).where(eq(topics.id, topicId))
  } catch (error) {
    logger.error(`Error deleting topic with ID ${topicId}:`, error)
    throw error
  }
}

/**
 * 根据助手 ID 删除该助手下的所有主题
 * @param assistantId - 助手的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteTopicsByAssistantId(assistantId: string): Promise<void> {
  try {
    await db.delete(topics).where(eq(topics.assistant_id, assistantId))
  } catch (error) {
    logger.error(`Error deleting topics by assistant ID ${assistantId}:`, error)
    throw error
  }
}

/**
 * 根据 ID 获取指定主题
 * @param topicId - 主题的唯一标识符
 * @returns 如果找到则返回主题对象，否则返回 undefined
 * @throws 当查询操作失败时抛出错误
 */
export async function getTopicById(topicId: string): Promise<Topic | undefined> {
  try {
    const result = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)

    if (result.length === 0) {
      return undefined
    }

    return transformDbToTopic(result[0])
  } catch (error) {
    logger.error(`Error getting topic by ID ${topicId}:`, error)
    throw error
  }
}

/**
 * 获取所有主题
 * @description 返回所有主题并按更新时间降序排序
 * @returns 返回所有主题的数组，按更新时间从新到旧排序
 * @throws 当查询操作失败时抛出错误
 */
export async function getTopics(): Promise<Topic[]> {
  try {
    const results = await db.select().from(topics).orderBy(desc(topics.updated_at))

    if (results.length === 0) {
      return []
    }

    return results.map(transformDbToTopic)
  } catch (error) {
    logger.error('Error getting topics:', error)
    throw error
  }
}

/**
 * 根据助手 ID 获取该助手的所有主题
 * @description 返回指定助手的所有主题并按更新时间降序排序
 * @param assistantId - 助手的唯一标识符
 * @returns 返回该助手的所有主题数组，按更新时间从新到旧排序
 * @throws 当查询操作失败时抛出错误
 */
export async function getTopicsByAssistantId(assistantId: string): Promise<Topic[]> {
  try {
    const results = await db
      .select()
      .from(topics)
      .where(eq(topics.assistant_id, assistantId))
      .orderBy(desc(topics.updated_at))

    if (results.length === 0) {
      return []
    }

    return results.map(transformDbToTopic)
  } catch (error) {
    logger.error(`Error getting topics by assistant ID ${assistantId}:`, error)
    throw error
  }
}

/**
 * 检查主题是否属于指定助手
 * @param assistantId - 助手的唯一标识符
 * @param topicId - 主题的唯一标识符
 * @returns 如果主题属于该助手返回 true，否则返回 false
 * @throws 当查询操作失败时抛出错误
 */
export async function isTopicOwnedByAssistant(assistantId: string, topicId: string): Promise<boolean> {
  try {
    const result = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)

    if (result.length === 0) {
      return false
    }

    return result[0].assistant_id === assistantId
  } catch (error) {
    logger.error(`Error checking if topic ${topicId} belongs to assistant ${assistantId}:`, error)
    throw error
  }
}

/**
 * 获取最新的主题
 * @description 按创建时间降序排序，返回最新创建的主题
 * @returns 如果存在主题则返回最新的主题对象，否则返回 undefined
 * @throws 当查询操作失败时抛出错误
 */
export async function getNewestTopic(): Promise<Topic | undefined> {
  try {
    const result = await db.select().from(topics).orderBy(desc(topics.created_at)).limit(1)

    if (result.length === 0) {
      return undefined
    }

    return transformDbToTopic(result[0])
  } catch (error) {
    logger.error('Error getting newest topic:', error)
    throw error
  }
}
