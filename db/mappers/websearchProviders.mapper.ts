import type { WebSearchProvider } from '@/types/websearch'
import { safeJsonParse } from '@/utils/json'

/**
 * 将数据库记录转换为 WebSearchProvider 类型。
 * @param dbRecord
 * @return 一个 WebSearchProvider 对象。
 */
export function transformDbToWebSearchProvider(dbRecord: any): WebSearchProvider {
  return {
    id: dbRecord.id,
    name: dbRecord.name,
    type: dbRecord.url ? 'free' : 'api',
    apiKey: dbRecord.api_key,
    apiHost: dbRecord.api_host,
    engines: dbRecord.engines ? safeJsonParse(dbRecord.engines) : [],
    url: dbRecord.url,
    basicAuthUsername: dbRecord.basic_auth_username,
    basicAuthPassword: dbRecord.basic_auth_password,
    contentLimit: dbRecord.content_limit,
    usingBrowser: !!dbRecord.using_browser
  }
}

/**
 * 将 WebSearchProvider 对象转换为数据库记录格式。
 * @param provider - WebSearchProvider 对象。
 * @returns 一个适合数据库操作的对象。
 */
export function transformWebSearchProviderToDb(provider: WebSearchProvider): any {
  return {
    id: provider.id,
    name: provider.name,
    api_key: provider.apiKey,
    api_host: provider.apiHost,
    engines: provider.engines ? JSON.stringify(provider.engines) : null,
    url: provider.url,
    basic_auth_username: provider.basicAuthUsername,
    basic_auth_password: provider.basicAuthPassword,
    content_limit: provider.contentLimit,
    using_browser: provider.usingBrowser ? 1 : 0
  }
}
