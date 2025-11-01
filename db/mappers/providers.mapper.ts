import type { Provider } from '@/types/assistant'
import { safeJsonParse } from '@/utils/json'

/**
 * 将数据库记录转换为 Provider 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 Provider 对象。
 */
export function transformDbToProvider(dbRecord: any): Provider {
  return {
    id: dbRecord.id,
    type: dbRecord.type,
    name: dbRecord.name,
    apiKey: dbRecord.api_key,
    apiHost: dbRecord.api_host,
    apiVersion: dbRecord.api_version,
    models: dbRecord.models ? safeJsonParse(dbRecord.models) : [],
    enabled: !!dbRecord.enabled,
    isSystem: !!dbRecord.is_system,
    isAuthed: !!dbRecord.is_authed,
    rateLimit: dbRecord.rate_limit,
    isNotSupportArrayContent: !!dbRecord.is_not_support_array_content,
    notes: dbRecord.notes
  }
}

/**
 * 将 Provider 对象转换为数据库记录格式。
 * @param provider - Provider 对象。
 * @returns 一个适合数据库操作的对象。
 */
export function transformProviderToDb(provider: Provider): any {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    api_key: provider.apiKey,
    api_host: provider.apiHost,
    api_version: provider.apiVersion,
    models: JSON.stringify(provider.models || []),
    enabled: provider.enabled ? 1 : 0,
    is_system: provider.isSystem ? 1 : 0,
    is_authed: provider.isAuthed ? 1 : 0,
    rate_limit: provider.rateLimit,
    is_not_support_array_content: provider.isNotSupportArrayContent ? 1 : 0,
    notes: provider.notes
  }
}
