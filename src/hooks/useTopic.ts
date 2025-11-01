import { desc } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import type { Assistant, Topic } from '@/types/assistant'

import { db } from '@db'
import { transformDbToTopic } from '@db/mappers'
import { topics as topicSchema } from '@db/schema'

const logger = loggerService.withContext('useTopic')

/**
 * Get current topic ID synchronously
 * This is used in non-React contexts where hooks cannot be used.
 */
export function getCurrentTopicId(): string {
  return topicService.getCurrentTopic()?.id || ''
}

/**
 * Get current topic object synchronously
 * This is used in non-React contexts where hooks cannot be used.
 */
export function getCurrentTopic(): Topic | null {
  return topicService.getCurrentTopic()
}

/**
 * React Hook for managing the currently active topic (Refactored with useSyncExternalStore)
 *
 * Uses TopicService with optimistic updates for zero-latency UX.
 * Integrates with React 18's useSyncExternalStore for efficient re-renders.
 *
 * @example
 * ```typescript
 * function ChatScreen() {
 *   const {
 *     currentTopic,
 *     isLoading,
 *     switchTopic,
 *     createNewTopic,
 *     renameTopic,
 *     deleteTopic
 *   } = useCurrentTopic()
 *
 *   return (
 *     <div>
 *       Current Topic: {currentTopic?.name}
 *       <button onClick={() => createNewTopic(assistant)}>New Topic</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useCurrentTopic() {
  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to current topic changes
   */
  const subscribe = useCallback((callback: () => void) => {
    logger.verbose('Subscribing to current topic changes')
    return topicService.subscribeCurrentTopic(callback)
  }, [])

  /**
   * Get current topic snapshot (synchronous)
   */
  const getSnapshot = useCallback(() => {
    return topicService.getCurrentTopic()
  }, [])

  /**
   * Server snapshot (for SSR compatibility - not used in React Native)
   */
  const getServerSnapshot = useCallback(() => {
    return null
  }, [])

  // Use useSyncExternalStore for reactive updates
  const currentTopic = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Loading State ====================

  /**
   * Track if we're loading the topic from database
   */
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Load current topic on mount if not cached
   */
  useEffect(() => {
    if (!currentTopic) {
      setIsLoading(true)
      topicService
        .getCurrentTopicAsync()
        .then(() => {
          setIsLoading(false)
        })
        .catch(error => {
          logger.error('Failed to load current topic:', error as Error)
          setIsLoading(false)
        })
    }
  }, [currentTopic])

  // ==================== Action Methods ====================

  /**
   * Switch to a different topic (optimistic)
   */
  const switchTopic = useCallback(async (topicId: string) => {
    try {
      await topicService.switchToTopic(topicId)
    } catch (error) {
      logger.error('Failed to switch topic:', error as Error)
      throw error
    }
  }, [])

  /**
   * Create a new topic (optimistic)
   */
  const createNewTopic = useCallback(async (assistant: Assistant) => {
    try {
      const newTopic = await topicService.createTopic(assistant)
      // Automatically switch to the new topic
      await topicService.switchToTopic(newTopic.id)
      return newTopic
    } catch (error) {
      logger.error('Failed to create new topic:', error as Error)
      throw error
    }
  }, [])

  /**
   * Rename current topic (optimistic)
   */
  const renameTopic = useCallback(
    async (newName: string) => {
      if (!currentTopic) {
        throw new Error('No current topic to rename')
      }
      try {
        await topicService.renameTopic(currentTopic.id, newName)
      } catch (error) {
        logger.error('Failed to rename current topic:', error as Error)
        throw error
      }
    },
    [currentTopic]
  )

  /**
   * Delete current topic (optimistic)
   */
  const deleteTopic = useCallback(async () => {
    if (!currentTopic) {
      throw new Error('No current topic to delete')
    }
    try {
      await topicService.deleteTopic(currentTopic.id)
    } catch (error) {
      logger.error('Failed to delete current topic:', error as Error)
      throw error
    }
  }, [currentTopic])

  // ==================== Return API ====================

  return {
    currentTopic,
    currentTopicId: currentTopic?.id || '',
    isLoading,
    switchTopic,
    createNewTopic,
    renameTopic,
    deleteTopic
  }
}

/**
 * React Hook for a specific topic with optimistic updates (Refactored with useSyncExternalStore)
 *
 * Uses TopicService's LRU cache and subscription system for efficient reactive updates.
 * Supports optimistic updates with automatic rollback on failure.
 *
 * @param topicId - The topic ID to watch
 * @returns topic data, loading state, and update/rename/delete methods
 *
 * @example
 * ```typescript
 * function TopicDetail({ topicId }) {
 *   const { topic, isLoading, renameTopic, deleteTopic } = useTopic(topicId)
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <div>
 *       <h1>{topic.name}</h1>
 *       <button onClick={() => renameTopic('New Name')}>Rename</button>
 *       <button onClick={deleteTopic}>Delete</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useTopic(topicId: string) {
  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to specific topic changes
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      logger.verbose(`Subscribing to topic ${topicId} changes`)
      return topicService.subscribeTopic(topicId, callback)
    },
    [topicId]
  )

  /**
   * Get topic snapshot (synchronous from cache)
   */
  const getSnapshot = useCallback(() => {
    return topicService.getTopicCached(topicId)
  }, [topicId])

  /**
   * Server snapshot (for SSR compatibility - not used in React Native)
   */
  const getServerSnapshot = useCallback(() => {
    return null
  }, [])

  // Use useSyncExternalStore for reactive updates
  const topic = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Loading State ====================

  /**
   * Track if we're loading the topic from database
   */
  const [, setIsLoading] = useState(false)

  /**
   * Load topic from database if not cached
   */
  useEffect(() => {
    if (!topic) {
      setIsLoading(true)
      topicService
        .getTopic(topicId)
        .then(() => {
          setIsLoading(false)
        })
        .catch(error => {
          logger.error(`Failed to load topic ${topicId}:`, error as Error)
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [topic, topicId])

  // ==================== Action Methods ====================

  /**
   * Update topic with optimistic updates
   */
  const updateTopic = useCallback(
    async (topic: Topic) => {
      await topicService.updateTopic(topicId, {
        name: topic.name,
        assistantId: topic.assistantId,
        isLoading: topic.isLoading,
        updatedAt: topic.updatedAt
      })
    },
    [topicId]
  )

  /**
   * Rename topic (optimistic)
   */
  const renameTopic = useCallback(
    async (newName: string) => {
      await topicService.renameTopic(topicId, newName)
    },
    [topicId]
  )

  /**
   * Delete topic (optimistic)
   */
  const deleteTopic = useCallback(async () => {
    await topicService.deleteTopic(topicId)
  }, [topicId])

  // ==================== Return API ====================

  // 当删除最后一个topic时会返回 null, 需要返回加载状态
  if (!topic) {
    return {
      topic: null,
      isLoading: true,
      updateTopic,
      renameTopic,
      deleteTopic
    }
  }

  return {
    topic,
    isLoading: false,
    updateTopic,
    renameTopic,
    deleteTopic
  }
}

export function useTopics() {
  const query = db
    .select({
      id: topicSchema.id,
      assistant_id: topicSchema.assistant_id,
      name: topicSchema.name,
      created_at: topicSchema.created_at,
      updated_at: topicSchema.updated_at,
      isLoading: topicSchema.isLoading
    })
    .from(topicSchema)
    .orderBy(desc(topicSchema.created_at))
  const { data: rawTopics, updatedAt } = useLiveQuery(query)

  const processedTopics = useMemo(() => {
    if (!rawTopics) return []
    return rawTopics.map(transformDbToTopic)
  }, [rawTopics])

  if (!updatedAt) {
    return {
      topics: [],
      isLoading: true
    }
  }

  return {
    topics: processedTopics,
    isLoading: false
  }
}
