import { eq, sql } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'

import { db } from '..'
import { transformDbToFile, transformFileToDb } from '../mappers'
import { files } from '../schema'
import { buildExcludedSet } from '../utils/buildExcludedSet'

const logger = loggerService.withContext('DataBase Files')

/**
 * 批量插入或更新文件记录
 * @description 使用 upsert 模式批量处理文件记录，ID 冲突时重置 count 为 1
 * @param filesToUpsert - 待插入或更新的文件元数据数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertFiles(filesToUpsert: FileMetadata[]) {
  if (filesToUpsert.length === 0) return

  try {
    const dbRecords = filesToUpsert.map(transformFileToDb)

    await db.transaction(async tx => {
      const updateFields = buildExcludedSet(dbRecords[0])
      updateFields.count = sql`1` // 特殊处理：冲突时重置 count 为 1

      await tx.insert(files).values(dbRecords).onConflictDoUpdate({
        target: files.id,
        set: updateFields
      })
    })
  } catch (error) {
    logger.error('Error upserting files:', error)
    throw error
  }
}

/**
 * 根据 ID 删除指定文件
 * @param fileId - 文件的唯一标识符
 * @returns 返回删除操作的结果
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteFileById(fileId: string) {
  try {
    return await db.delete(files).where(eq(files.id, fileId))
  } catch (error) {
    logger.error('Error deleting file by ID:', error)
    throw error
  }
}

/**
 * 获取所有文件记录
 * @returns 如果存在文件则返回文件元数据数组，否则返回 null
 * @throws 当查询操作失败时抛出错误
 */
export async function getAllFiles(): Promise<FileMetadata[] | null> {
  try {
    const result = await db.select().from(files)

    if (result.length === 0) {
      return null
    }

    return result.map(transformDbToFile)
  } catch (error) {
    logger.error('Error getting all files:', error)
    throw error
  }
}

/**
 * 根据 ID 获取指定文件
 * @param id - 文件的唯一标识符
 * @returns 如果找到则返回文件元数据对象，否则返回 null
 * @throws 当查询操作失败时抛出错误
 */
export async function getFileById(id: string): Promise<FileMetadata | null> {
  try {
    const result = await db.select().from(files).where(eq(files.id, id)).limit(1)

    if (result.length === 0) {
      return null
    }

    return transformDbToFile(result[0])
  } catch (error) {
    logger.error('Error getting file by ID:', error)
    throw error
  }
}
