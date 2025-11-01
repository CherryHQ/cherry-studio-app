import type { Assistant } from '@/types/assistant'
import { safeJsonParse } from '@/utils/json'

import { transformDbToTopic } from './topics.mapper'

/**
 * 将数据库记录转换为 Assistant 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 Assistant 对象。
 */
export function transformDbToAssistant(dbRecord: any): Assistant {
  const topics = Array.isArray(dbRecord.topics) ? dbRecord.topics.map(transformDbToTopic) : []
  return {
    id: dbRecord.id,
    name: dbRecord.name,
    prompt: dbRecord.prompt,
    // knowledgeIds: safeJsonParse(dbRecord.knowledge_ids, []),
    type: dbRecord.type,
    emoji: dbRecord.emoji,
    description: dbRecord.description,
    model: safeJsonParse(dbRecord.model),
    defaultModel: safeJsonParse(dbRecord.default_model),
    settings: safeJsonParse(dbRecord.settings),
    enableWebSearch: !!dbRecord.enable_web_search,
    webSearchProviderId: dbRecord.websearch_provider_id,
    enableGenerateImage: !!dbRecord.enable_generate_image,
    mcpServers: safeJsonParse(dbRecord.mcp_servers),
    knowledgeRecognition: dbRecord.knowledge_recognition,
    tags: safeJsonParse(dbRecord.tags, []),
    group: safeJsonParse(dbRecord.group, []),
    topics: topics
  }
}

/**
 * 将 Assistant 对象转换为数据库记录格式。
 * @param assistant - Assistant 对象。
 * @returns 一个适合数据库操作的对象。
 */
export function transformAssistantToDb(assistant: Assistant): any {
  return {
    id: assistant.id,
    name: assistant.name,
    prompt: assistant.prompt,
    // knowledge_ids: assistant.knowledgeIds ? JSON.stringify(assistant.knowledgeIds) : null,
    type: assistant.type,
    emoji: assistant.emoji,
    description: assistant.description,
    model: assistant.model ? JSON.stringify(assistant.model) : null,
    default_model: assistant.defaultModel ? JSON.stringify(assistant.defaultModel) : null,
    settings: assistant.settings ? JSON.stringify(assistant.settings) : null,
    enable_web_search: assistant.enableWebSearch ? 1 : 0,
    websearch_provider_id: assistant.webSearchProviderId === undefined ? null : assistant.webSearchProviderId,
    enable_generate_image: assistant.enableGenerateImage ? 1 : 0,
    mcp_servers: assistant.mcpServers ? JSON.stringify(assistant.mcpServers) : null,
    knowledge_recognition: assistant.knowledgeRecognition,
    tags: assistant.tags ? JSON.stringify(assistant.tags) : null,
    group: assistant.group ? JSON.stringify(assistant.group) : null
  }
}
