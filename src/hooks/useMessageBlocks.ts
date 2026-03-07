import { db } from '@db'
import { transformDbToMessageBlock } from '@db/mappers'
import { messageBlocks as messageBlocksSchema, messages as messagesSchema } from '@db/schema'
import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { useEffect, useMemo, useRef, useState } from 'react'

import { loggerService } from '@/services/LoggerService'
import { streamingService } from '@/services/messageStreaming/StreamingService'
import type { MessageBlock } from '@/types/message'

const logger = loggerService.withContext('useTopicBlocks')
const getBlockKey = (blockId: string) => `message.streaming.block.${blockId}` as const

/**
 * Topic 级别的 blocks 监听器（推荐使用）
 * 
 * 合并数据库 blocks 和流式中的 blocks（来自 Cache）
 */
export const useTopicBlocks = (topicId: string) => {
  const [updateTrigger, setUpdateTrigger] = useState(0)
  const unsubscribersRef = useRef<(() => void)[]>([])

  // Query 1: Get all message IDs for this topic (to subscribe to all messages)
  const messagesQuery = db
    .select({ id: messagesSchema.id })
    .from(messagesSchema)
    .where(eq(messagesSchema.topic_id, topicId))

  const { data: rawMessages } = useLiveQuery(messagesQuery, [topicId])

  // Query 2: Get all blocks for this topic
  const query = db
    .select({
      block: messageBlocksSchema,
      messageId: messagesSchema.id
    })
    .from(messageBlocksSchema)
    .innerJoin(messagesSchema, eq(messageBlocksSchema.message_id, messagesSchema.id))
    .where(eq(messagesSchema.topic_id, topicId))

  const { data: rawData } = useLiveQuery(query, [topicId])

  // Subscribe to ALL messages in the topic (including streaming ones without blocks in DB)
  useEffect(() => {
    if (!rawMessages) return

    // Cleanup previous subscriptions
    unsubscribersRef.current.forEach(unsub => unsub())
    unsubscribersRef.current = []

    logger.debug('Subscribing to messages', {
      messageCount: rawMessages.length,
      messageIds: rawMessages.map(m => m.id)
    })

    // Subscribe to each message's streaming state
    rawMessages.forEach(({ id: messageId }) => {
      const unsubStreaming = streamingService.subscribeToMessage(messageId, () => {
        logger.debug('Streaming notification received', { messageId, isStreaming: streamingService.isStreaming(messageId) })
        setUpdateTrigger(prev => prev + 1)
      })

      unsubscribersRef.current.push(unsubStreaming)
    })

    return () => {
      unsubscribersRef.current.forEach(unsub => unsub())
      unsubscribersRef.current = []
    }
  }, [rawMessages])

  // 在内存中按 message_id 分组，并合并流式数据
  const messageBlocks = useMemo(() => {
    const grouped: Record<string, MessageBlock[]> = {}

    // First, add all blocks from database
    if (rawData) {
      rawData.forEach(({ block, messageId }) => {
        if (!grouped[messageId]) {
          grouped[messageId] = []
        }
        grouped[messageId].push(transformDbToMessageBlock(block))
      })
    }

    // Then, merge streaming blocks for ALL messages (including ones without blocks in DB)
    if (rawMessages) {
      rawMessages.forEach(({ id: messageId }) => {
        const isStreaming = streamingService.isStreaming(messageId)
        if (isStreaming) {
          const streamingBlocks = streamingService.getAllBlocks(messageId)
          logger.debug('Merging streaming blocks', {
            messageId,
            blockCount: streamingBlocks.length,
            blockTypes: streamingBlocks.map(b => b.type)
          })
          if (streamingBlocks.length > 0) {
            grouped[messageId] = streamingBlocks
          }
        }
      })
    }

    return grouped
  }, [rawData, rawMessages, updateTrigger])

  return {
    messageBlocks: messageBlocks
  }
}
