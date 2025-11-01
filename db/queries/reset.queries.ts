import { loggerService } from '@/services/LoggerService'

import { db } from '..'
import {
  assistants,
  files,
  messageBlocks,
  messages,
  preferenceTable,
  providers,
  topics,
  websearch_providers
} from '../schema'

const logger = loggerService.withContext('Reset Database')

/**
 * 清空所有数据库表
 * @description 删除所有表中的数据，但保留表结构
 */
export async function clearAllTables(): Promise<void> {
  try {
    logger.info('Starting to clear all database tables...')

    await db.transaction(async tx => {
      // 按照外键依赖关系的顺序删除数据
      // 先删除依赖于其他表的数据

      // 1. 删除消息块（依赖于消息）
      await tx.delete(messageBlocks)
      logger.info('Cleared message_blocks table')

      // 2. 删除消息（依赖于主题和助手）
      await tx.delete(messages)
      logger.info('Cleared messages table')

      // 3. 删除主题（依赖于助手）
      await tx.delete(topics)
      logger.info('Cleared topics table')

      // 4. 删除助手
      await tx.delete(assistants)
      logger.info('Cleared assistants table')

      // 5. 删除其他独立的表
      await tx.delete(providers)
      logger.info('Cleared providers table')

      await tx.delete(websearch_providers)
      logger.info('Cleared websearch_providers table')

      await tx.delete(files)
      logger.info('Cleared files table')

      await tx.delete(preferenceTable)
      logger.info('Cleared preference table')
    })

    logger.info('Successfully cleared all database tables')
  } catch (error) {
    logger.error('Error clearing database tables:', error)
    throw error
  }
}

export async function resetDatabase() {
  try {
    logger.info('Starting database reset to initial state...')
    await clearAllTables()
  } catch (error) {
    logger.error('Error clearing database tables:', error)
    throw error
  }
}
