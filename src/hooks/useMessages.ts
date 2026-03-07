import { db } from '@db'
import { transformDbToMessage } from '@db/mappers'
import { messageBlocks as messageBlocksSchema, messages as messagesSchema } from '@db/schema'
import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { useEffect, useRef,useState } from 'react'

import { cacheService } from '@/services/CacheService'
import { streamingService } from '@/services/messageStreaming/StreamingService'
import type { Message } from '@/types/message'

const getMessageKey = (messageId: string) => `message.streaming.content.${messageId}` as const

export const useMessages = (topicId: string) => {
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
  const unsubscribersRef = useRef<(() => void)[]>([])

  // Subscribe to streaming message changes via CacheService
  useEffect(() => {
    if (!rawMessages) return

    // Cleanup previous subscriptions
    unsubscribersRef.current.forEach(unsub => unsub())
    unsubscribersRef.current = []

    // Subscribe to each message's streaming state
    rawMessages.forEach(msg => {
      const messageKey = getMessageKey(msg.id)
      
      // Subscribe to cache changes
      const unsubCache = cacheService.subscribe(messageKey, () => {
        // Force re-process messages when cache changes
        setProcessedMessages(prev => {
          // Trigger a re-render by creating a new array
          return [...prev]
        })
      })
      
      // Subscribe to streaming service notifications
      const unsubStreaming = streamingService.subscribeToMessage(msg.id, () => {
        setProcessedMessages(prev => [...prev])
      })
      
      unsubscribersRef.current.push(unsubCache, unsubStreaming)
    })

    return () => {
      unsubscribersRef.current.forEach(unsub => unsub())
      unsubscribersRef.current = []
    }
  }, [rawMessages])

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

    // Merge streaming messages
    const streamingMessages: Message[] = []
    messages.forEach(msg => {
      if (streamingService.isStreaming(msg.id)) {
        const streamingMessage = streamingService.getMessage(msg.id)
        if (streamingMessage) {
          streamingMessages.push(streamingMessage)
        } else {
          streamingMessages.push(msg)
        }
      } else {
        streamingMessages.push(msg)
      }
    })

    setProcessedMessages(streamingMessages)
  }, [rawMessages, rawBlocks, topicId])

  return { messages: processedMessages }
}
