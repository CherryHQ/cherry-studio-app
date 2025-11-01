import { eq } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

import { db } from '..'
import { transformAssistantToDb, transformDbToAssistant } from '../mappers'
import { assistants } from '../schema'
import { buildExcludedSet } from '../utils/buildExcludedSet'

const logger = loggerService.withContext('DataBase Assistants')

/**
 * 批量插入或更新助手记录
 * @description 使用 upsert 模式，如果助手 ID 已存在则更新，否则插入新记录
 * @param assistantsToUpsert - 待插入或更新的助手数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertAssistants(assistantsToUpsert: Assistant[]) {
  if (assistantsToUpsert.length === 0) return

  try {
    const dbRecords = assistantsToUpsert.map(transformAssistantToDb)

    await db.transaction(async tx => {
      const updateFields = buildExcludedSet(dbRecords[0])

      await tx.insert(assistants).values(dbRecords).onConflictDoUpdate({
        target: assistants.id,
        set: updateFields
      })
    })
  } catch (error) {
    logger.error('Error upserting assistants:', error)
    throw error
  }
}

/**
 * 根据 ID 删除指定助手
 * @param id - 助手的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteAssistantById(id: string) {
  try {
    await db.delete(assistants).where(eq(assistants.id, id))
  } catch (error) {
    logger.error(`Error deleting assistant with ID ${id}:`, error)
    throw error
  }
}

/**
 * 获取所有助手
 * @description 查询所有助手并关联查询其主题数据
 * @returns 返回所有助手的数组
 * @throws 当查询操作失败时抛出错误
 */
export async function getAllAssistants(): Promise<Assistant[]> {
  try {
    const results = await db.query.assistants.findMany({
      with: {
        topics: true
      }
    })
    return results.map(transformDbToAssistant)
  } catch (error) {
    logger.error('Error getting all assistants:', error)
    throw error
  }
}

/**
 * 获取所有外部助手
 * @description 查询类型为 'external' 的助手，并关联查询其主题数据
 * @returns 返回外部助手的数组
 * @throws 当查询操作失败时抛出错误
 */
export async function getExternalAssistants(): Promise<Assistant[]> {
  try {
    const results = await db.query.assistants.findMany({
      where: eq(assistants.type, 'external'),
      with: {
        topics: true
      }
    })
    return results.map(transformDbToAssistant)
  } catch (error) {
    logger.error('Error getting star assistants:', error)
    throw error
  }
}

/**
 * 根据 ID 获取指定助手
 * @param id - 助手的唯一标识符
 * @returns 如果找到则返回助手对象，否则返回 null
 * @throws 当查询操作失败时抛出错误
 */
export async function getAssistantById(id: string): Promise<Assistant | null> {
  try {
    const result = await db.select().from(assistants).where(eq(assistants.id, id)).limit(1)

    if (result.length === 0) {
      return null
    }

    return transformDbToAssistant(result[0])
  } catch (error) {
    logger.error('Error getting assistant by ID:', error)
    throw error
  }
}
