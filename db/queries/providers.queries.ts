import { eq } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import type { Provider } from '@/types/assistant'

import { db } from '..'
import { transformDbToProvider, transformProviderToDb } from '../mappers'
import { providers } from '../schema'
import { buildExcludedSet } from '../utils/buildExcludedSet'

const logger = loggerService.withContext('DataBase Providers')

/**
 * 批量插入或更新 LLM 提供商配置
 * @description 使用 upsert 模式处理提供商的新增或更新操作
 * @param providersToUpsert - 待插入或更新的提供商数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertProviders(providersToUpsert: Provider[]) {
  if (providersToUpsert.length === 0) return

  try {
    const dbRecords = providersToUpsert.map(transformProviderToDb)

    await db.transaction(async tx => {
      const updateFields = buildExcludedSet(dbRecords[0])

      await tx.insert(providers).values(dbRecords).onConflictDoUpdate({
        target: providers.id,
        set: updateFields
      })
    })
  } catch (error) {
    logger.error('Error in upsertProviders:', error)
    throw error
  }
}

/**
 * 根据 ID 删除指定的提供商
 * @param providerId - 提供商的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteProvider(providerId: string): Promise<void> {
  try {
    await db.delete(providers).where(eq(providers.id, providerId))
  } catch (error) {
    logger.error('Error in deleteProvider:', error)
    throw error
  }
}

/**
 * 根据 ID 获取指定提供商（异步）
 * @param providerId - 提供商的唯一标识符
 * @returns 如果找到则返回提供商对象，否则返回 undefined
 * @throws 当查询操作失败时抛出错误
 */
export async function getProviderById(providerId: string): Promise<Provider | undefined> {
  try {
    const result = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1)

    if (result.length === 0) {
      return undefined
    }

    return transformDbToProvider(result[0])
  } catch (error) {
    logger.error('Error in getProviderById:', error)
    throw error
  }
}

/**
 * 获取所有提供商配置
 * @returns 返回所有提供商的数组，如果没有则返回空数组
 * @throws 当查询操作失败时抛出错误
 */
export async function getAllProviders(): Promise<Provider[]> {
  try {
    const result = await db.select().from(providers)

    if (result.length === 0) {
      return []
    }

    return result.map(transformDbToProvider)
  } catch (error) {
    logger.error('Error in getAllProviders:', error)
    throw error
  }
}

/**
 * 根据 ID 获取指定提供商（同步）
 * @description 同步方式查询提供商，适用于需要立即获取结果的场景
 * @param providerId - 提供商的唯一标识符
 * @returns 如果找到则返回提供商对象，否则返回 undefined
 * @throws 当查询操作失败时抛出错误
 */
export function getProviderByIdSync(providerId: string): Provider | undefined {
  try {
    const result = db.select().from(providers).where(eq(providers.id, providerId)).get()

    if (!result) {
      return undefined
    }

    return transformDbToProvider(result)
  } catch (error) {
    logger.error('Error in getProviderById:', error)
    throw error
  }
}
