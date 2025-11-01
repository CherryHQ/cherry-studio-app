import type { Message } from '@/types/message'
import { safeJsonParse } from '@/utils/json'

/**
 * 将数据库记录转换为 Message 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 Message 对象。
 */
export function transformDbToMessage(dbRecord: any): Message {
  return {
    id: dbRecord.id,
    role: dbRecord.role,
    assistantId: dbRecord.assistant_id,
    topicId: dbRecord.topic_id,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    status: dbRecord.status,
    modelId: dbRecord.model_id,
    model: dbRecord.model ? safeJsonParse(dbRecord.model) : undefined,
    type: dbRecord.type,
    useful: !!dbRecord.useful,
    askId: dbRecord.ask_id,
    mentions: dbRecord.mentions ? safeJsonParse(dbRecord.mentions) : undefined,
    usage: dbRecord.usage ? safeJsonParse(dbRecord.usage) : undefined,
    metrics: dbRecord.metrics ? safeJsonParse(dbRecord.metrics) : undefined,
    multiModelMessageStyle: dbRecord.multi_model_message_style,
    foldSelected: !!dbRecord.fold_selected,
    // 注意：'blocks' 字段需要通过查询 message_blocks 表来单独填充。
    blocks: []
  }
}

/**
 * 将 Message 对象转换为数据库记录格式。
 * 注意：此函数不处理 'blocks' 属性，因为块存储在单独的表中。
 * @param message - Message 对象。
 * @returns 一个适合数据库操作的对象。
 */
export function transformMessageToDb(message: Partial<Message>): any {
  const dbRecord: any = {}

  if (message.id !== undefined) dbRecord.id = message.id
  if (message.role !== undefined) dbRecord.role = message.role
  if (message.assistantId !== undefined) dbRecord.assistant_id = message.assistantId
  if (message.topicId !== undefined) dbRecord.topic_id = message.topicId
  if (message.createdAt !== undefined) dbRecord.created_at = message.createdAt
  if (message.updatedAt !== undefined) dbRecord.updated_at = message.updatedAt
  if (message.status !== undefined) dbRecord.status = message.status
  if (message.modelId !== undefined) dbRecord.model_id = message.modelId
  if (message.type !== undefined) dbRecord.type = message.type
  if (message.askId !== undefined) dbRecord.ask_id = message.askId
  if (message.multiModelMessageStyle !== undefined) dbRecord.multi_model_message_style = message.multiModelMessageStyle

  if (message.useful !== undefined) {
    dbRecord.useful = message.useful ? 1 : 0
  }

  if (message.foldSelected !== undefined) {
    dbRecord.fold_selected = message.foldSelected ? 1 : 0
  }

  if (message.model !== undefined) {
    dbRecord.model = message.model ? JSON.stringify(message.model) : null
  }

  if (message.mentions !== undefined) {
    dbRecord.mentions = message.mentions ? JSON.stringify(message.mentions) : null
  }

  if (message.usage !== undefined) {
    dbRecord.usage = message.usage ? JSON.stringify(message.usage) : null
  }

  if (message.metrics !== undefined) {
    dbRecord.metrics = message.metrics ? JSON.stringify(message.metrics) : null
  }

  return dbRecord
}
