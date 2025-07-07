import { eq } from 'drizzle-orm'

import { Topic } from '@/types/assistant'
import { Message } from '@/types/message'
import { safeJsonParse } from '@/utils/json'

import { db } from '..'
import { topics } from '../schema'

/**
 * 将数据库记录转换为 Topic 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 Topic 对象。
 */
export function transformDbToTopic(dbRecord: any): Topic {
  return {
    id: dbRecord.id,
    assistantId: dbRecord.assistant_id,
    name: dbRecord.name,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    messages: dbRecord.messages ? safeJsonParse(dbRecord.messages) : [],
    // 将数字（0 或 1）转换为布尔值
    pinned: !!dbRecord.pinned,
    prompt: dbRecord.prompt,
    isNameManuallyEdited: !!dbRecord.is_name_manually_edited
  }
}

/**
 * 将 Topic 对象转换为数据库记录格式。
 * @param topic - Topic 对象。
 * @returns 一个适合数据库操作的对象。
 */
function transformTopicToDb(topic: Topic): any {
  return {
    id: topic.id,
    assistant_id: topic.assistantId,
    name: topic.name,
    created_at: topic.createdAt,
    updated_at: topic.updatedAt,
    messages: JSON.stringify(topic.messages),
    // 将布尔值转换为数字（1 表示 true，0 表示 false）
    pinned: topic.pinned ? 1 : 0,
    prompt: topic.prompt,
    is_name_manually_edited: topic.isNameManuallyEdited ? 1 : 0
  }
}

/**
 * 根据 ID 获取单个主题。
 * @param topicId - 要获取的主题的 ID。
 * @returns 一个 Topic 对象，如果未找到则返回 undefined。
 */
export async function getTopicById(topicId: string): Promise<Topic | undefined> {
  try {
    const result = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1)

    if (result.length === 0) {
      return undefined
    }

    const topic = transformDbToTopic(result[0])
    return topic
  } catch (error) {
    console.error(`Error getting topic by ID ${topicId}:`, error)
    throw error
  }
}

/**
 * 更新主题的消息。
 * @param topicId - 主题的 ID。
 * @param messages - 要更新的消息数组。
 * @returns 无返回值，但会在数据库中更新主题的消息。
 */
export async function updateTopicMessages(topicId: string, messages: Message[]) {
  try {
    const topic = await getTopicById(topicId)

    if (!topic) {
      throw new Error(`Topic with ID ${topicId} not found`)
    }

    // 更新主题的消息
    topic.messages = messages.map(message => ({
      ...message,
      createdAt: message.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))

    // 将更新后的主题转换为数据库格式
    const dbRecord = transformTopicToDb(topic)

    // 更新数据库中的主题记录
    await db.update(topics).set(dbRecord).where(eq(topics.id, topicId))
  } catch (error) {
    console.error(`Error updating topic messages for topic ID ${topicId}:`, error)
    throw error
  }
}

/**
 * 插入或更新一个或多个主题 (Upsert)。
 * @param topicsToUpsert - 要插入或更新的主题对象或对象数组。
 * @returns 包含已更新或插入的主题的数组的 Promise。
 */
export async function upsertTopics(topicsToUpsert: Topic | Topic[]): Promise<Topic[]> {
  const topicsArray = Array.isArray(topicsToUpsert) ? topicsToUpsert : [topicsToUpsert]
  if (topicsArray.length === 0) return []

  try {
    const dbRecords = topicsArray.map(transformTopicToDb)

    const upsertPromises = dbRecords.map(record =>
      db
        .insert(topics)
        .values(record)
        .onConflictDoUpdate({
          target: topics.id,
          set: record
        })
        .returning()
    )

    const results = await Promise.all(upsertPromises)
    const flattenedResults = results.flat()
    return flattenedResults.map(transformDbToTopic)
  } catch (error) {
    console.error('Error upserting topic(s):', error)
    throw error
  }
}

export async function getTopics(): Promise<Topic[]> {
  try {
    const results = await db.select().from(topics)

    if (results.length === 0) {
      return []
    }

    // 获取所有主题的消息
    const topicsWithMessages = await Promise.all(
      results.map(async dbRecord => {
        const topic = transformDbToTopic(dbRecord)
        // topic.messages = await getMessagesByTopicId(topic.id)
        return topic
      })
    )

    // 按 updatedAt 排序，最新的在前面
    return topicsWithMessages.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } catch (error) {
    console.error('Error getting topics:', error)
    throw error
  }
}

export async function deleteTopicById(topicId: string): Promise<void> {
  try {
    await db.delete(topics).where(eq(topics.id, topicId))
  } catch (error) {
    console.error(`Error deleting topic with ID ${topicId}:`, error)
    throw error
  }
}
