import { eq, inArray } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import type { MessageBlock } from '@/types/message'

import { db } from '..'
import { transformDbToMessageBlock, transformMessageBlockToDb, transformPartialMessageBlockToDb } from '../mappers'
import { messageBlocks } from '../schema'
import { buildExcludedSet } from '../utils/buildExcludedSet'

const logger = loggerService.withContext('DataBase Message Blocks')

/**
 * 插入或更新消息块
 * @description 在事务中批量处理消息块的 upsert 操作，支持单个或数组形式
 * @param blocks - 单个消息块或消息块数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertBlocks(blocks: MessageBlock | MessageBlock[]) {
  const blocksArray = Array.isArray(blocks) ? blocks : [blocks]
  if (blocksArray.length === 0) return

  try {
    const dbRecords = blocksArray.map(transformMessageBlockToDb)

    await db.transaction(async tx => {
      const updateFields = buildExcludedSet(dbRecords[0])

      await tx.insert(messageBlocks).values(dbRecords).onConflictDoUpdate({
        target: messageBlocks.id,
        set: updateFields
      })
    })
  } catch (error) {
    logger.error('Error upserting block(s):', error)
    throw error
  }
}

/**
 * 批量删除多个消息块
 * @param blockIds - 消息块 ID 数组
 * @throws 当删除操作失败时抛出错误
 */
export async function removeManyBlocks(blockIds: string[]) {
  if (blockIds.length === 0) return

  try {
    await db.delete(messageBlocks).where(inArray(messageBlocks.id, blockIds))
  } catch (error) {
    logger.error('Error removing multiple blocks:', error)
    throw error
  }
}

/**
 * 删除所有消息块
 * @description 清空消息块表中的所有数据，操作不可逆
 * @throws 当删除操作失败时抛出错误
 */
export async function removeAllBlocks() {
  try {
    await db.delete(messageBlocks)
  } catch (error) {
    logger.error('Error removing all blocks:', error)
    throw error
  }
}

/**
 * 更新单个消息块的部分字段
 * @description 支持部分字段更新，自动设置 updated_at 时间戳
 * @param update - 包含消息块 ID 和变更字段的对象
 * @param update.id - 消息块的唯一标识符
 * @param update.changes - 需要更新的字段（部分更新）
 * @returns 返回更新后的消息块对象，未找到时返回 null
 * @throws 当更新操作失败时抛出错误
 */
export async function updateOneBlock(update: { id: string; changes: Partial<MessageBlock> }) {
  const { id, changes } = update

  if (Object.keys(changes).length === 0) {
    const currentRecord = db.select().from(messageBlocks).where(eq(messageBlocks.id, id)).get()
    return currentRecord ? transformDbToMessageBlock(currentRecord) : null
  }

  const dbUpdatePayload = transformPartialMessageBlockToDb(changes)

  try {
    await db.update(messageBlocks).set(dbUpdatePayload).where(eq(messageBlocks.id, id))
  } catch (error) {
    logger.error('Failed to update message block in database:', error)
    throw error
  }
}

/**
 * 根据块 ID 获取指定的消息块
 * @param blockId - 消息块的唯一标识符
 * @returns 如果找到则返回消息块对象，否则返回 null
 * @throws 当查询操作失败时抛出错误
 */
export async function getBlockById(blockId: string): Promise<MessageBlock | null> {
  try {
    const dbRecord = await db.select().from(messageBlocks).where(eq(messageBlocks.id, blockId)).limit(1).execute()

    if (dbRecord.length === 0) {
      return null
    }

    return transformDbToMessageBlock(dbRecord[0])
  } catch (error) {
    logger.error(`Error getting block with ID ${blockId}:`, error)
    throw error
  }
}

export async function getAllBlocks(): Promise<MessageBlock[]> {
  try {
    const dbRecords = await db.select().from(messageBlocks).execute()

    return dbRecords.map(transformDbToMessageBlock)
  } catch (error) {
    logger.error('Error getting all blocks:', error)
    throw error
  }
}
