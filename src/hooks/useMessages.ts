import { db } from '@db'
import { transformDbToMessage } from '@db/mappers'
import { messageBlocks as messageBlocksSchema, messages as messagesSchema } from '@db/schema'
import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { useEffect, useState } from 'react'

import type { Message } from '@/types/message'

export const useMessages = (topicId: string) => {
  const startTime = performance.now()

  // Query 1: 获取所有 messages
  const messagesQuery = db
    .select()
    .from(messagesSchema)
    .where(eq(messagesSchema.topic_id, topicId))
    .orderBy(messagesSchema.created_at)

  const { data: rawMessages } = useLiveQuery(messagesQuery, [topicId])

  // Query 2: 获取这个 topic 下所有 messages 的所有 blocks（只需要 id 和 message_id）
  const blocksQuery = db
    .select({
      message_id: messageBlocksSchema.message_id,
      id: messageBlocksSchema.id
    })
    .from(messageBlocksSchema)
    .innerJoin(messagesSchema, eq(messageBlocksSchema.message_id, messagesSchema.id))
    .where(eq(messagesSchema.topic_id, topicId))

  const { data: rawBlocks } = useLiveQuery(blocksQuery, [topicId])

  const [processedMessages, setProcessedMessages] = useState<Message[]>([])

  useEffect(() => {
    if (!rawMessages || !rawBlocks) {
      return
    }

    // 在内存中按 message_id 分组 blocks
    const blocksByMessage = rawBlocks.reduce(
      (acc, block) => {
        if (!acc[block.message_id]) {
          acc[block.message_id] = []
        }
        acc[block.message_id].push(block.id)
        return acc
      },
      {} as Record<string, string[]>
    )

    // 组装 messages
    const messages = rawMessages.map(rawMsg => {
      const message = transformDbToMessage(rawMsg)
      message.blocks = blocksByMessage[rawMsg.id] || []
      return message
    })

    setProcessedMessages(messages)
  }, [rawMessages, rawBlocks, topicId, startTime])

  return { messages: processedMessages }
}
