import { db } from '@db'
import { transformDbToMessageBlock } from '@db/mappers'
import { messageBlocks as messageBlocksSchema, messages as messagesSchema } from '@db/schema'
import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { useMemo } from 'react'

import type { MessageBlock } from '@/types/message'

/**
 * Topic 级别的 blocks 监听器（推荐使用）
 */
export const useTopicBlocks = (topicId: string) => {
  // 单次查询获取这个 topic 下所有 messages 的所有 blocks
  const query = db
    .select({
      block: messageBlocksSchema,
      messageId: messagesSchema.id
    })
    .from(messageBlocksSchema)
    .innerJoin(messagesSchema, eq(messageBlocksSchema.message_id, messagesSchema.id))
    .where(eq(messagesSchema.topic_id, topicId))

  const { data: rawData } = useLiveQuery(query, [topicId])

  // 在内存中按 message_id 分组
  const messageBlocks = useMemo(() => {
    if (!rawData) {
      return {}
    }

    const grouped = rawData.reduce(
      (acc, { block, messageId }) => {
        if (!acc[messageId]) {
          acc[messageId] = []
        }
        acc[messageId].push(transformDbToMessageBlock(block))
        return acc
      },
      {} as Record<string, MessageBlock[]>
    )

    return grouped
  }, [rawData])

  return {
    messageBlocks: messageBlocks
  }
}
