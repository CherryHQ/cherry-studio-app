import { eq } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import { WebSearchProvider } from '@/types/websearch'

import { db } from '..'
import { transformDbToWebSearchProvider, transformWebSearchProviderToDb } from '../mappers'
import { websearch_providers } from '../schema'
import { buildExcludedSet } from '../utils/buildExcludedSet'

const logger = loggerService.withContext('DataBase WebSearchProviders')

/**
 * 批量插入或更新网络搜索提供商配置
 * @description 使用 upsert 模式处理网络搜索提供商的新增或更新操作
 * @param providersToUpsert - 待插入或更新的网络搜索提供商数组
 * @throws 当数据库操作失败时抛出错误
 */
export async function upsertWebSearchProviders(providersToUpsert: WebSearchProvider[]) {
  if (providersToUpsert.length === 0) return

  try {
    const dbRecords = providersToUpsert.map(transformWebSearchProviderToDb)

    await db.transaction(async tx => {
      const updateFields = buildExcludedSet(dbRecords[0])

      await tx.insert(websearch_providers).values(dbRecords).onConflictDoUpdate({
        target: websearch_providers.id,
        set: updateFields
      })
    })
  } catch (error) {
    logger.error('Error in upsertWebSearchProviders:', error)
    throw error
  }
}

/**
 * 获取所有网络搜索提供商配置
 * @returns 返回所有网络搜索提供商的数组，如果没有则返回空数组
 * @throws 当查询操作失败时抛出错误
 */
export async function getAllWebSearchProviders(): Promise<WebSearchProvider[]> {
  try {
    const result = await db.select().from(websearch_providers)

    if (result.length === 0) {
      return []
    }

    return result.map(transformDbToWebSearchProvider)
  } catch (error) {
    logger.error('Error in getAllWebSearchProviders:', error)
    throw error
  }
}

/**
 * 根据 ID 获取指定网络搜索提供商（异步）
 * @description 异步方式查询网络搜索提供商
 * @param providerId - 网络搜索提供商的唯一标识符
 * @returns 如果找到则返回网络搜索提供商对象，否则返回 null
 * @throws 当查询操作失败时抛出错误
 */
export async function getWebSearchProviderById(providerId: string): Promise<WebSearchProvider | null> {
  try {
    const result = await db.select().from(websearch_providers).where(eq(websearch_providers.id, providerId)).get()

    if (!result) {
      return null
    }

    return transformDbToWebSearchProvider(result)
  } catch (error) {
    logger.error('Error in getWebSearchProviderById:', error)
    throw error
  }
}

/**
 * 根据 ID 获取指定网络搜索提供商（同步）
 * @description 同步方式查询网络搜索提供商，适用于需要立即获取结果的场景
 * @param providerId - 网络搜索提供商的唯一标识符
 * @returns 如果找到则返回网络搜索提供商对象，否则返回 undefined
 * @throws 当查询操作失败时抛出错误
 */
export function getWebSearchProviderByIdSync(providerId: string): WebSearchProvider | undefined {
  try {
    const result = db.select().from(websearch_providers).where(eq(websearch_providers.id, providerId)).get()

    if (!result) {
      return undefined
    }

    return transformDbToWebSearchProvider(result)
  } catch (error) {
    logger.error('Error in getWebSearchProviderById:', error)
    throw error
  }
}

/**
 * 根据 ID 删除指定网络搜索提供商
 * @description 从数据库中删除指定的网络搜索提供商
 * @param providerId - 网络搜索提供商的唯一标识符
 * @throws 当删除操作失败时抛出错误
 */
export async function deleteWebSearchProvider(providerId: string): Promise<void> {
  try {
    await db.delete(websearch_providers).where(eq(websearch_providers.id, providerId))
    logger.debug(`Deleted WebSearch provider: ${providerId}`)
  } catch (error) {
    logger.error('Error in deleteWebSearchProvider:', error)
    throw error
  }
}
