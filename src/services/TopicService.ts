/**
 * TopicService - Unified topic management service with optimistic updates
 *
 * Design Principles:
 * 1. Singleton Pattern - Global unique instance with shared cache
 * 2. Current Topic Cache - Cache only the active topic to minimize memory
 * 3. Type Safety - Full generic support with automatic type inference
 * 4. Observer Pattern - Integrated with React's useSyncExternalStore
 * 5. Optimistic Updates - Immediate UI response with background persistence
 *
 * Architecture:
 * ```
 * React Components
 *   ↓ useCurrentTopic / useTopic
 * React Hooks (useSyncExternalStore)
 *   ↓ subscribe / getSnapshot
 * TopicService (This File)
 *   • Current Topic Cache (single Topic object)
 *   • Subscription Management (Map<topicId, Set<callback>>)
 *   • Request Queue (Concurrency Control)
 *   • Error Handling + Logging
 *   ↓
 * topicDatabase → SQLite
 * ```
 *
 * @example Basic Usage
 * ```typescript
 * // Get current topic
 * const currentTopic = topicService.getCurrentTopic()
 *
 * // Create new topic (optimistic)
 * const newTopic = await topicService.createTopic(assistant)
 *
 * // Subscribe to current topic changes
 * const unsubscribe = topicService.subscribeCurrentTopic(() => {
 *   console.log('Current topic changed!')
 * })
 * ```
 */

import { topicDatabase } from '@database'
import { t } from 'i18next'

import { loggerService } from '@/services/LoggerService'
import { preferenceService } from '@/services/PreferenceService'
import type { Assistant, Topic } from '@/types/assistant'
import { uuid } from '@/utils'

const logger = loggerService.withContext('TopicService')

/**
 * Unsubscribe function returned by subscribe methods
 */
type UnsubscribeFunction = () => void

/**
 * TopicService - Singleton service for managing topics with optimistic updates
 */
export class TopicService {
  // ==================== Singleton ====================
  private static instance: TopicService

  private constructor() {
    logger.debug('TopicService instance created')
    this.initializeCurrentTopic()
  }

  /**
   * Get the singleton instance of TopicService
   */
  public static getInstance(): TopicService {
    if (!TopicService.instance) {
      TopicService.instance = new TopicService()
    }
    return TopicService.instance
  }

  // ==================== Core Storage ====================

  /**
   * Cache for the current active topic
   * Always kept in sync with preference 'topic.current_id'
   */
  private currentTopicCache: Topic | null = null

  /**
   * LRU Cache for recently accessed topics
   * Max size: 5 topics (in addition to current topic)
   *
   * Structure: Map<topicId, Topic>
   * When cache size exceeds limit, oldest entry is removed
   */
  private topicCache = new Map<string, Topic>()

  /**
   * Maximum number of topics to cache (excluding current topic)
   */
  private readonly MAX_CACHE_SIZE = 5

  /**
   * Access order tracking for LRU eviction
   * Most recently accessed at the end
   */
  private accessOrder: string[] = []

  /**
   * Flag indicating if the current topic is being loaded
   */
  private isLoadingCurrentTopic = false

  /**
   * Promise for ongoing current topic load operation
   * Prevents duplicate concurrent loads of current topic
   */
  private currentTopicLoadPromise: Promise<Topic | null> | null = null

  /**
   * Promise for ongoing load operations per topic
   * Key: topicId, Value: Promise
   */
  private loadPromises = new Map<string, Promise<Topic | null>>()

  /**
   * Cache for all topics (Map for O(1) lookup by ID)
   * Key: topic ID
   * Value: Topic object
   */
  private allTopicsCache = new Map<string, Topic>()

  /**
   * Timestamp when all topics were last loaded from database
   * Used for TTL-based cache invalidation
   */
  private allTopicsCacheTimestamp: number | null = null

  /**
   * Cache time-to-live in milliseconds (5 minutes)
   * After this duration, cache is considered stale
   */
  private readonly CACHE_TTL = 5 * 60 * 1000

  /**
   * Flag indicating if all topics are being loaded
   */
  private isLoadingAllTopics = false

  /**
   * Promise for ongoing load all topics operation
   * Prevents duplicate concurrent loads
   */
  private loadAllTopicsPromise: Promise<Topic[]> | null = null

  // ==================== Subscription System ====================

  /**
   * Subscribers for current topic changes
   * These are notified when the current topic changes
   */
  private currentTopicSubscribers = new Set<() => void>()

  /**
   * Subscribers for specific topic changes
   * Key: topicId
   * Value: Set of callback functions
   */
  private topicSubscribers = new Map<string, Set<() => void>>()

  /**
   * Global subscribers that listen to all topic changes
   */
  private globalSubscribers = new Set<() => void>()

  /**
   * Subscribers for all topics list changes
   * These are notified when the topics list changes (create/update/delete)
   * Used by useTopics() hook
   */
  private allTopicsSubscribers = new Set<() => void>()

  // ==================== Concurrency Control ====================

  /**
   * Update queue to ensure sequential writes for each topic
   * Prevents race conditions when the same topic is updated multiple times rapidly
   *
   * Key: topicId
   * Value: Promise of the ongoing update operation
   */
  private updateQueue = new Map<string, Promise<void>>()

  // ==================== Initialization ====================

  /**
   * Initialize current topic from preference
   * Called during service construction
   */
  private async initializeCurrentTopic(): Promise<void> {
    try {
      const currentTopicId = preferenceService.getCached('topic.current_id')

      if (currentTopicId) {
        // Load current topic from database
        const topic = await topicDatabase.getTopicById(currentTopicId)
        if (topic) {
          this.currentTopicCache = topic
          logger.debug(`Initialized current topic: ${topic.id}`)
        }
      }
    } catch (error) {
      logger.error('Failed to initialize current topic:', error as Error)
    }
  }

  // ==================== Public API: Current Topic ====================

  /**
   * Get the current active topic (synchronous)
   *
   * Returns the cached current topic immediately.
   * If not cached, returns null.
   *
   * @returns The current topic or null
   */
  public getCurrentTopic(): Topic | null {
    return this.currentTopicCache
  }

  /**
   * Get the current active topic (async)
   *
   * Loads from database if not cached.
   *
   * @returns Promise resolving to the current topic or null
   */
  public async getCurrentTopicAsync(): Promise<Topic | null> {
    // Return cached value if available
    if (this.currentTopicCache) {
      return this.currentTopicCache
    }

    // If already loading, wait for the ongoing load
    if (this.isLoadingCurrentTopic && this.currentTopicLoadPromise) {
      return await this.currentTopicLoadPromise
    }

    // Load from database
    this.isLoadingCurrentTopic = true
    this.currentTopicLoadPromise = this.loadCurrentTopicFromDatabase()

    try {
      const topic = await this.currentTopicLoadPromise
      return topic
    } finally {
      this.isLoadingCurrentTopic = false
      this.currentTopicLoadPromise = null
    }
  }

  /**
   * Switch to a different topic (optimistic)
   *
   * Updates UI immediately, then persists to preference store.
   * Automatically moves the old current topic to LRU cache.
   * Uses LRU cache when available to avoid database queries.
   *
   * @param topicId - The topic ID to switch to
   */
  public async switchToTopic(topicId: string): Promise<void> {
    try {
      // Load topic using getTopic() which uses LRU cache
      const topic = await this.getTopic(topicId)

      if (!topic) {
        throw new Error(`Topic with ID ${topicId} not found`)
      }

      // Save old topic for rollback and LRU caching
      const oldTopic = this.currentTopicCache

      // Remove new topic from LRU cache (it will become current topic)
      if (this.topicCache.has(topicId)) {
        this.topicCache.delete(topicId)
        const index = this.accessOrder.indexOf(topicId)
        if (index > -1) {
          this.accessOrder.splice(index, 1)
        }
        logger.debug(`Removed new current topic from LRU cache: ${topicId}`)
      }

      // Optimistic update: update cache immediately
      this.currentTopicCache = topic

      // Move old current topic to LRU cache (if exists and different from new topic)
      if (oldTopic && oldTopic.id !== topicId) {
        this.addToCache(oldTopic.id, oldTopic)
        logger.debug(`Moved previous current topic to LRU cache: ${oldTopic.id}`)
      }

      // Notify subscribers (UI updates immediately)
      this.notifyCurrentTopicSubscribers()

      try {
        // Persist to preference store
        await preferenceService.set('topic.current_id', topicId)
        logger.info(`Switched to topic: ${topicId}`)
      } catch (error) {
        // Rollback on failure
        logger.error('Failed to switch topic, rolling back:', error as Error)
        this.currentTopicCache = oldTopic

        // Rollback LRU cache changes
        if (oldTopic && oldTopic.id !== topicId) {
          this.topicCache.delete(oldTopic.id)
          const index = this.accessOrder.indexOf(oldTopic.id)
          if (index > -1) {
            this.accessOrder.splice(index, 1)
          }
        }

        this.notifyCurrentTopicSubscribers()
        throw error
      }
    } catch (error) {
      logger.error('Failed to switch topic:', error as Error)
      throw error
    }
  }

  // ==================== Public API: CRUD Operations ====================

  /**
   * Create a new topic (optimistic)
   *
   * Creates topic immediately in memory, then persists to database.
   *
   * @param assistant - The assistant for this topic
   * @returns The created topic
   */
  public async createTopic(assistant: Assistant): Promise<Topic> {
    const newTopic: Topic = {
      id: uuid(),
      assistantId: assistant.id,
      name: t('topics.new_topic'),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    logger.info('Creating new topic (optimistic):', newTopic.id)

    // Optimistic: return immediately
    // Background: save to database
    this.performTopicCreate(newTopic).catch(error => {
      logger.error('Failed to persist new topic:', error as Error)
      // Note: We don't rollback here because the topic has already been returned
      // The UI has already updated. Consider implementing a retry mechanism.
    })

    return newTopic
  }

  /**
   * Update a topic (optimistic)
   *
   * Updates immediately in cache if it's the current topic, then persists.
   *
   * @param topicId - The topic ID to update
   * @param updates - Partial topic data to update
   */
  public async updateTopic(topicId: string, updates: Partial<Omit<Topic, 'id'>>): Promise<void> {
    // Wait for any ongoing update to the same topic
    const previousUpdate = this.updateQueue.get(topicId)
    if (previousUpdate) {
      await previousUpdate
    }

    // Execute current update
    const currentUpdate = this.performTopicUpdate(topicId, updates)
    this.updateQueue.set(topicId, currentUpdate)

    try {
      await currentUpdate
    } finally {
      // Clean up queue
      if (this.updateQueue.get(topicId) === currentUpdate) {
        this.updateQueue.delete(topicId)
      }
    }
  }

  /**
   * Rename a topic (optimistic)
   *
   * Convenience method for updating topic name.
   *
   * @param topicId - The topic ID to rename
   * @param newName - The new name
   */
  public async renameTopic(topicId: string, newName: string): Promise<void> {
    await this.updateTopic(topicId, {
      name: newName.trim(),
      updatedAt: Date.now()
    })
    logger.info('Renamed topic:', topicId, newName)
  }

  /**
   * Delete a topic (optimistic)
   *
   * Removes from cache if it's the current topic, then deletes from database.
   *
   * @param topicId - The topic ID to delete
   */
  public async deleteTopic(topicId: string): Promise<void> {
    logger.info('Deleting topic (optimistic):', topicId)

    // If deleting current topic, clear cache
    const isCurrentTopic = this.currentTopicCache?.id === topicId
    const oldTopic = isCurrentTopic ? this.currentTopicCache : null
    const oldCachedTopic = this.allTopicsCache.get(topicId)

    if (isCurrentTopic) {
      this.currentTopicCache = null
      this.notifyCurrentTopicSubscribers()
    }

    // Remove from allTopicsCache if it exists
    if (this.allTopicsCache.has(topicId)) {
      this.allTopicsCache.delete(topicId)
      logger.verbose(`Removed topic from cache: ${topicId}`)
    }

    try {
      // Delete from database
      await topicDatabase.deleteTopicById(topicId)

      // Notify topic-specific subscribers
      this.notifyTopicSubscribers(topicId)
      this.notifyGlobalSubscribers()
      this.notifyAllTopicsSubscribers()

      logger.info('Topic deleted successfully:', topicId)
    } catch (error) {
      // Rollback if failed
      if (isCurrentTopic && oldTopic) {
        logger.error('Failed to delete topic, rolling back:', error as Error)
        this.currentTopicCache = oldTopic
        this.notifyCurrentTopicSubscribers()
      }
      // Rollback cache
      if (oldCachedTopic) {
        this.allTopicsCache.set(topicId, oldCachedTopic)
      }
      throw error
    }
  }

  // ==================== Public API: Query Operations ====================

  /**
   * Get a topic by ID with LRU caching (async)
   *
   * This method implements smart caching:
   * 1. Check if it's the current topic → return from currentTopicCache
   * 2. Check LRU cache → return if cached
   * 3. Load from database → cache and return
   *
   * @param topicId - The topic ID
   * @returns Promise resolving to the topic or null
   */
  public async getTopic(topicId: string): Promise<Topic | null> {
    // 1. Check if it's the current topic
    if (this.currentTopicCache?.id === topicId) {
      logger.verbose(`Returning current topic from cache: ${topicId}`)
      return this.currentTopicCache
    }

    // 2. Check LRU cache
    if (this.topicCache.has(topicId)) {
      logger.verbose(`LRU cache hit for topic: ${topicId}`)
      const topic = this.topicCache.get(topicId)!
      this.updateAccessOrder(topicId)
      return topic
    }

    // 3. Check if already loading
    if (this.loadPromises.has(topicId)) {
      logger.verbose(`Waiting for ongoing load: ${topicId}`)
      return await this.loadPromises.get(topicId)!
    }

    // 4. Load from database
    logger.debug(`Loading topic from database: ${topicId}`)
    const loadPromise = this.loadTopicFromDatabase(topicId)
    this.loadPromises.set(topicId, loadPromise)

    try {
      const topic = await loadPromise
      return topic
    } finally {
      this.loadPromises.delete(topicId)
    }
  }

  /**
   * Get a topic by ID synchronously (from cache only)
   *
   * Returns immediately from cache. Returns null if not cached.
   *
   * @param topicId - The topic ID
   * @returns The cached topic or null
   */
  public getTopicCached(topicId: string): Topic | null {
    // Check current topic
    if (this.currentTopicCache?.id === topicId) {
      return this.currentTopicCache
    }

    // Check LRU cache
    if (this.topicCache.has(topicId)) {
      const topic = this.topicCache.get(topicId)!
      this.updateAccessOrder(topicId)
      return topic
    }

    return null
  }

  /**
   * Get the newest topic
   *
   * @returns The newest topic or null
   */
  public async getNewestTopic(): Promise<Topic | null> {
    const topic = await topicDatabase.getNewestTopic()
    return topic ?? null
  }

  /**
   * Get a topic by ID (alias for getTopic, for backward compatibility)
   *
   * @param topicId - The topic ID
   * @returns The topic or null
   * @deprecated Use getTopic() instead
   */
  public async getTopicById(topicId: string): Promise<Topic | null> {
    return await this.getTopic(topicId)
  }

  /**
   * Get all topics
   *
   * @returns Array of all topics
   */
  public async getTopics(): Promise<Topic[]> {
    return await topicDatabase.getTopics()
  }

  /**
   * Get topics by assistant ID
   *
   * @param assistantId - The assistant ID
   * @returns Array of topics for the assistant
   */
  public async getTopicsByAssistantId(assistantId: string): Promise<Topic[]> {
    return await topicDatabase.getTopicsByAssistantId(assistantId)
  }

  /**
   * Check if a topic is owned by a specific assistant
   *
   * @param assistantId - The assistant ID
   * @param topicId - The topic ID to check
   * @returns True if the topic belongs to the assistant
   */
  public async isTopicOwnedByAssistant(assistantId: string, topicId: string): Promise<boolean> {
    return await topicDatabase.isTopicOwnedByAssistant(assistantId, topicId)
  }

  /**
   * Delete all topics owned by a specific assistant (optimistic)
   *
   * Removes topics from cache and database. If current topic is deleted,
   * it will be cleared from the cache.
   *
   * @param assistantId - The assistant ID whose topics should be deleted
   */
  public async deleteTopicsByAssistantId(assistantId: string): Promise<void> {
    logger.info('Deleting all topics for assistant (optimistic):', assistantId)

    // Check if current topic belongs to this assistant
    const isCurrentTopicAffected =
      this.currentTopicCache && (await this.isTopicOwnedByAssistant(assistantId, this.currentTopicCache.id))

    const oldCurrentTopic = isCurrentTopicAffected ? this.currentTopicCache : null

    // Get all topics for this assistant for cache cleanup
    const affectedTopics = await topicDatabase.getTopicsByAssistantId(assistantId)
    const affectedTopicIds = new Set(affectedTopics.map(t => t.id))

    // Optimistically update cache
    if (isCurrentTopicAffected) {
      this.currentTopicCache = null
      this.notifyCurrentTopicSubscribers()
    }

    // Remove affected topics from LRU cache
    affectedTopicIds.forEach(topicId => {
      if (this.topicCache.has(topicId)) {
        this.topicCache.delete(topicId)
        const index = this.accessOrder.indexOf(topicId)
        if (index > -1) {
          this.accessOrder.splice(index, 1)
        }
      }
    })

    // Remove affected topics from all topics cache
    affectedTopicIds.forEach(topicId => {
      if (this.allTopicsCache.has(topicId)) {
        this.allTopicsCache.delete(topicId)
      }
    })

    try {
      // Delete from database
      await topicDatabase.deleteTopicsByAssistantId(assistantId)

      // Notify subscribers for all affected topics
      affectedTopicIds.forEach(topicId => {
        this.notifyTopicSubscribers(topicId)
      })

      this.notifyGlobalSubscribers()
      this.notifyAllTopicsSubscribers()

      logger.info(`Deleted ${affectedTopicIds.size} topics for assistant: ${assistantId}`)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to delete topics by assistant, rolling back:', error as Error)

      if (isCurrentTopicAffected && oldCurrentTopic) {
        this.currentTopicCache = oldCurrentTopic
        this.notifyCurrentTopicSubscribers()
      }

      // Note: We can't easily rollback LRU and allTopicsCache without re-fetching
      // This is acceptable since the operation failed at database level
      throw error
    }
  }

  // ==================== Public API: Cache Operations ====================

  /**
   * Get all topics with caching
   *
   * Loads from cache if available and not stale, otherwise loads from database.
   * This is the main method for loading all topics with automatic caching.
   *
   * @param forceRefresh - Force reload from database even if cache is valid
   * @returns Promise resolving to array of all topics
   *
   * @example
   * ```typescript
   * const topics = await topicService.getAllTopics()
   * ```
   */
  public async getAllTopics(forceRefresh = false): Promise<Topic[]> {
    // Check if cache is valid
    const isCacheValid =
      !forceRefresh &&
      this.allTopicsCacheTimestamp !== null &&
      Date.now() - this.allTopicsCacheTimestamp < this.CACHE_TTL &&
      this.allTopicsCache.size > 0

    if (isCacheValid) {
      logger.verbose('Returning cached topics, cache size:', this.allTopicsCache.size)
      return Array.from(this.allTopicsCache.values())
    }

    // If already loading, wait for ongoing load
    if (this.isLoadingAllTopics && this.loadAllTopicsPromise) {
      logger.verbose('Waiting for ongoing getAllTopics operation')
      return await this.loadAllTopicsPromise
    }

    // Load from database
    return await this.loadAllTopicsFromDatabase()
  }

  /**
   * Get all topics from cache (synchronous)
   *
   * Returns cached topics immediately. If cache is empty, returns empty array.
   * Used by React's useSyncExternalStore for synchronous snapshot.
   *
   * @returns Array of cached topics
   *
   * @example
   * ```typescript
   * const topics = topicService.getAllTopicsCached()
   * ```
   */
  public getAllTopicsCached(): Topic[] {
    return Array.from(this.allTopicsCache.values())
  }

  /**
   * Get a topic from cache by ID (synchronous)
   *
   * Returns the topic if it exists in cache, otherwise null.
   * Does not query database.
   *
   * @param topicId - The topic ID to retrieve
   * @returns The cached topic or null
   *
   * @example
   * ```typescript
   * const topic = topicService.getTopicFromCache('topic-123')
   * ```
   */
  public getTopicFromCache(topicId: string): Topic | null {
    return this.allTopicsCache.get(topicId) ?? null
  }

  /**
   * Refresh all topics cache from database
   *
   * Forces a reload of all topics from database, updating the cache.
   * Useful for pull-to-refresh functionality.
   *
   * @returns Promise resolving to array of refreshed topics
   *
   * @example
   * ```typescript
   * await topicService.refreshAllTopicsCache()
   * ```
   */
  public async refreshAllTopicsCache(): Promise<Topic[]> {
    logger.info('Manually refreshing all topics cache')
    return await this.getAllTopics(true)
  }

  /**
   * Invalidate all topics cache
   *
   * Clears the cache and forces next access to reload from database.
   * Used for logout or data reset scenarios.
   */
  public invalidateCache(): void {
    this.allTopicsCache.clear()
    this.allTopicsCacheTimestamp = null
    logger.info('All topics cache invalidated')
    this.notifyAllTopicsSubscribers()
  }

  // ==================== Public API: Subscription ====================

  /**
   * Subscribe to current topic changes
   *
   * The callback is invoked whenever the current topic changes.
   *
   * @param callback - Function to call when current topic changes
   * @returns Unsubscribe function
   */
  public subscribeCurrentTopic(callback: () => void): UnsubscribeFunction {
    this.currentTopicSubscribers.add(callback)
    logger.verbose(`Added current topic subscriber, total: ${this.currentTopicSubscribers.size}`)

    return () => {
      this.currentTopicSubscribers.delete(callback)
      logger.verbose(`Removed current topic subscriber, remaining: ${this.currentTopicSubscribers.size}`)
    }
  }

  /**
   * Subscribe to changes for a specific topic
   *
   * @param topicId - The topic ID to watch
   * @param callback - Function to call when the topic changes
   * @returns Unsubscribe function
   */
  public subscribeTopic(topicId: string, callback: () => void): UnsubscribeFunction {
    if (!this.topicSubscribers.has(topicId)) {
      this.topicSubscribers.set(topicId, new Set())
    }

    const subscribers = this.topicSubscribers.get(topicId)!
    subscribers.add(callback)

    logger.verbose(`Added subscriber for topic ${topicId}, total: ${subscribers.size}`)

    return () => {
      subscribers.delete(callback)

      // Clean up empty subscriber sets
      if (subscribers.size === 0) {
        this.topicSubscribers.delete(topicId)
        logger.verbose(`Removed last subscriber for topic ${topicId}, cleaned up`)
      } else {
        logger.verbose(`Removed subscriber for topic ${topicId}, remaining: ${subscribers.size}`)
      }
    }
  }

  /**
   * Subscribe to all topic changes
   *
   * @param callback - Function to call when any topic changes
   * @returns Unsubscribe function
   */
  public subscribeAll(callback: () => void): UnsubscribeFunction {
    this.globalSubscribers.add(callback)
    logger.verbose(`Added global subscriber, total: ${this.globalSubscribers.size}`)

    return () => {
      this.globalSubscribers.delete(callback)
      logger.verbose(`Removed global subscriber, remaining: ${this.globalSubscribers.size}`)
    }
  }

  /**
   * Subscribe to all topics list changes
   *
   * The callback is invoked whenever the topics list changes (create/update/delete).
   * Used by useTopics() hook with useSyncExternalStore.
   *
   * @param callback - Function to call when topics list changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = topicService.subscribeAllTopics(() => {
   *   console.log('Topics list updated!')
   * })
   * ```
   */
  public subscribeAllTopics(callback: () => void): UnsubscribeFunction {
    this.allTopicsSubscribers.add(callback)
    logger.verbose(`Added all topics subscriber, total: ${this.allTopicsSubscribers.size}`)

    return () => {
      this.allTopicsSubscribers.delete(callback)
      logger.verbose(`Removed all topics subscriber, remaining: ${this.allTopicsSubscribers.size}`)
    }
  }

  /**
   * Subscribe to changes for a specific topic from cache
   *
   * Similar to subscribeTopic(), but specifically designed for cache-based subscriptions.
   * Used by useTopic(id) hook when reading from cache instead of database.
   *
   * @param topicId - The topic ID to watch
   * @param callback - Function to call when the topic changes in cache
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = topicService.subscribeTopicFromCache('topic-123', () => {
   *   console.log('Topic updated in cache!')
   * })
   * ```
   */
  public subscribeTopicFromCache(topicId: string, callback: () => void): UnsubscribeFunction {
    // Reuse the existing topicSubscribers infrastructure
    return this.subscribeTopic(topicId, callback)
  }

  // ==================== Private Methods: Database Operations ====================

  /**
   * Load current topic from database
   */
  private async loadCurrentTopicFromDatabase(): Promise<Topic | null> {
    try {
      const currentTopicId = await preferenceService.get('topic.current_id')

      if (!currentTopicId) {
        logger.debug('No current topic ID in preferences')
        return null
      }

      const topic = await topicDatabase.getTopicById(currentTopicId)

      if (topic) {
        this.currentTopicCache = topic
        logger.debug(`Loaded current topic from database: ${topic.id}`)
        return topic
      } else {
        logger.warn(`Current topic ID ${currentTopicId} not found in database`)
        return null
      }
    } catch (error) {
      logger.error('Failed to load current topic from database:', error as Error)
      return null
    }
  }

  /**
   * Load a topic from database and add to LRU cache
   */
  private async loadTopicFromDatabase(topicId: string): Promise<Topic | null> {
    try {
      const topic = await topicDatabase.getTopicById(topicId)

      if (topic) {
        // Add to LRU cache
        this.addToCache(topicId, topic)
        logger.debug(`Loaded topic from database and cached: ${topicId}`)
        return topic
      } else {
        logger.warn(`Topic ${topicId} not found in database`)
        return null
      }
    } catch (error) {
      logger.error(`Failed to load topic ${topicId} from database:`, error as Error)
      return null
    }
  }

  /**
   * Load all topics from database and update cache
   *
   * This method is called when cache is invalid or forced refresh is requested.
   * It prevents duplicate concurrent loads using a promise flag.
   */
  private async loadAllTopicsFromDatabase(): Promise<Topic[]> {
    // If already loading, wait for the ongoing operation
    if (this.isLoadingAllTopics && this.loadAllTopicsPromise) {
      logger.verbose('Waiting for ongoing loadAllTopics operation')
      return await this.loadAllTopicsPromise
    }

    // Start loading
    this.isLoadingAllTopics = true
    this.loadAllTopicsPromise = (async () => {
      try {
        logger.info('Loading all topics from database')
        const topics = await topicDatabase.getTopics()

        // Update cache
        this.allTopicsCache.clear()
        topics.forEach(topic => {
          this.allTopicsCache.set(topic.id, topic)
        })

        // Update timestamp
        this.allTopicsCacheTimestamp = Date.now()

        logger.info(`Loaded ${topics.length} topics into cache`)

        // Notify subscribers
        this.notifyAllTopicsSubscribers()

        return topics
      } catch (error) {
        logger.error('Failed to load all topics from database:', error as Error)
        throw error
      } finally {
        this.isLoadingAllTopics = false
        this.loadAllTopicsPromise = null
      }
    })()

    return await this.loadAllTopicsPromise
  }

  /**
   * Perform topic creation with error handling
   */
  private async performTopicCreate(topic: Topic): Promise<void> {
    try {
      await topicDatabase.upsertTopics([topic])
      logger.debug(`Topic created successfully: ${topic.id}`)

      // Update cache if it exists
      if (this.allTopicsCache.size > 0 || this.allTopicsCacheTimestamp !== null) {
        this.allTopicsCache.set(topic.id, topic)
        logger.verbose(`Added new topic to cache: ${topic.id}`)
      }

      // Notify subscribers
      this.notifyTopicSubscribers(topic.id)
      this.notifyGlobalSubscribers()
      this.notifyAllTopicsSubscribers()
    } catch (error) {
      logger.error(`Failed to create topic ${topic.id}:`, error as Error)
      throw error
    }
  }

  /**
   * Perform optimistic topic update with rollback on failure
   */
  private async performTopicUpdate(topicId: string, updates: Partial<Omit<Topic, 'id'>>): Promise<void> {
    // Save old data for rollback
    const oldCurrentTopic = this.currentTopicCache?.id === topicId ? { ...this.currentTopicCache! } : null
    const oldLRUTopic = this.topicCache.get(topicId) ? { ...this.topicCache.get(topicId)! } : null
    const oldAllTopicsTopic = this.allTopicsCache.get(topicId) ? { ...this.allTopicsCache.get(topicId)! } : null

    try {
      // Fetch current topic data
      let currentTopicData: Topic

      // Try to get from current topic cache
      if (this.currentTopicCache?.id === topicId) {
        currentTopicData = this.currentTopicCache
      }
      // Try to get from LRU cache
      else if (this.topicCache.has(topicId)) {
        currentTopicData = this.topicCache.get(topicId)!
      }
      // Try to get from all topics cache
      else if (this.allTopicsCache.has(topicId)) {
        currentTopicData = this.allTopicsCache.get(topicId)!
      }
      // Load from database
      else {
        const topic = await topicDatabase.getTopicById(topicId)
        if (!topic) {
          throw new Error(`Topic with ID ${topicId} not found`)
        }
        currentTopicData = topic
      }

      // Prepare updated topic
      const updatedTopic: Topic = {
        ...currentTopicData,
        ...updates,
        id: topicId, // Ensure ID is not overwritten
        updatedAt: Date.now()
      }

      // Optimistic update: update all caches
      this.updateTopicInCache(topicId, updatedTopic)

      // Notify subscribers (UI updates immediately)
      if (this.currentTopicCache?.id === topicId) {
        this.notifyCurrentTopicSubscribers()
      }
      this.notifyTopicSubscribers(topicId)

      // Persist to database
      await topicDatabase.upsertTopics([updatedTopic])

      // Notify other subscribers
      this.notifyGlobalSubscribers()
      this.notifyAllTopicsSubscribers()

      logger.debug(`Topic updated successfully: ${topicId}`)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to update topic, rolling back:', error as Error)

      // Rollback current topic cache
      if (oldCurrentTopic) {
        this.currentTopicCache = oldCurrentTopic
        this.notifyCurrentTopicSubscribers()
      }

      // Rollback LRU cache
      if (oldLRUTopic) {
        this.topicCache.set(topicId, oldLRUTopic)
      } else {
        this.topicCache.delete(topicId)
      }

      // Rollback all topics cache
      if (oldAllTopicsTopic) {
        this.allTopicsCache.set(topicId, oldAllTopicsTopic)
      } else {
        this.allTopicsCache.delete(topicId)
      }

      // Notify subscribers to revert UI
      this.notifyTopicSubscribers(topicId)

      throw error
    }
  }

  // ==================== Private Methods: Notification ====================

  /**
   * Notify all current topic subscribers
   */
  private notifyCurrentTopicSubscribers(): void {
    if (this.currentTopicSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.currentTopicSubscribers.size} current topic subscribers`)
      this.currentTopicSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in current topic subscriber callback:', error as Error)
        }
      })
    }
  }

  /**
   * Notify all subscribers for a specific topic
   */
  private notifyTopicSubscribers(topicId: string): void {
    const subscribers = this.topicSubscribers.get(topicId)
    if (subscribers && subscribers.size > 0) {
      logger.verbose(`Notifying ${subscribers.size} subscribers for topic ${topicId}`)
      subscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error(`Error in topic ${topicId} subscriber callback:`, error as Error)
        }
      })
    }
  }

  /**
   * Notify all global subscribers
   */
  private notifyGlobalSubscribers(): void {
    if (this.globalSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.globalSubscribers.size} global subscribers`)
      this.globalSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in global subscriber callback:', error as Error)
        }
      })
    }
  }

  /**
   * Notify all topics list subscribers
   *
   * Called when the topics list changes (create/update/delete).
   * Used by useTopics() hook with useSyncExternalStore.
   */
  private notifyAllTopicsSubscribers(): void {
    if (this.allTopicsSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.allTopicsSubscribers.size} all topics subscribers`)
      this.allTopicsSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in all topics subscriber callback:', error as Error)
        }
      })
    }
  }

  // ==================== Private Methods: LRU Cache Management ====================

  /**
   * Add or update a topic in the LRU cache
   *
   * If cache is full, evicts the oldest entry.
   * Updates access order.
   *
   * @param topicId - The topic ID
   * @param topic - The topic data
   */
  private addToCache(topicId: string, topic: Topic): void {
    // Don't cache the current topic in LRU cache (it has its own cache)
    if (this.currentTopicCache?.id === topicId) {
      logger.verbose(`Skipping LRU cache for current topic: ${topicId}`)
      return
    }

    // If cache is full and topic is not already cached, evict oldest
    if (!this.topicCache.has(topicId) && this.topicCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestFromCache()
    }

    // Add or update in cache
    this.topicCache.set(topicId, topic)

    // Update access order
    this.updateAccessOrder(topicId)

    logger.verbose(`Added topic to LRU cache: ${topicId} (cache size: ${this.topicCache.size})`)
  }

  /**
   * Update access order for LRU eviction
   *
   * Moves the topicId to the end of the access order (most recently used).
   *
   * @param topicId - The topic ID to update
   */
  private updateAccessOrder(topicId: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(topicId)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }

    // Add to end (most recently used)
    this.accessOrder.push(topicId)
  }

  /**
   * Evict the oldest (least recently used) topic from cache
   */
  private evictOldestFromCache(): void {
    if (this.accessOrder.length === 0) {
      logger.warn('Attempted to evict from empty LRU cache')
      return
    }

    // Get oldest topic (first in access order)
    const oldestTopicId = this.accessOrder.shift()!

    // Remove from cache
    this.topicCache.delete(oldestTopicId)

    logger.debug(`Evicted oldest topic from LRU cache: ${oldestTopicId}`)
  }

  /**
   * Update a topic in all caches
   *
   * Updates the topic in:
   * - currentTopicCache (if it's the current topic)
   * - topicCache (LRU cache)
   * - allTopicsCache (if exists)
   *
   * @param topicId - The topic ID
   * @param updatedTopic - The updated topic data
   */
  private updateTopicInCache(topicId: string, updatedTopic: Topic): void {
    // Update current topic cache if it's the current topic
    if (this.currentTopicCache?.id === topicId) {
      this.currentTopicCache = updatedTopic
      logger.verbose(`Updated current topic cache: ${topicId}`)
    }

    // Update LRU cache if it exists
    if (this.topicCache.has(topicId)) {
      this.topicCache.set(topicId, updatedTopic)
      this.updateAccessOrder(topicId)
      logger.verbose(`Updated LRU cache for topic: ${topicId}`)
    }

    // Update all topics cache if it exists
    if (this.allTopicsCache.has(topicId)) {
      this.allTopicsCache.set(topicId, updatedTopic)
      logger.verbose(`Updated all topics cache for topic: ${topicId}`)
    }
  }

  /**
   * Remove a topic from all caches
   *
   * @param topicId - The topic ID to remove
   */
  private removeTopicFromCache(topicId: string): void {
    // Remove from current topic cache if it's the current topic
    if (this.currentTopicCache?.id === topicId) {
      this.currentTopicCache = null
      logger.verbose(`Removed current topic cache: ${topicId}`)
    }

    // Remove from LRU cache
    if (this.topicCache.has(topicId)) {
      this.topicCache.delete(topicId)
      const index = this.accessOrder.indexOf(topicId)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      logger.verbose(`Removed from LRU cache: ${topicId}`)
    }

    // Remove from all topics cache
    if (this.allTopicsCache.has(topicId)) {
      this.allTopicsCache.delete(topicId)
      logger.verbose(`Removed from all topics cache: ${topicId}`)
    }
  }

  // ==================== Debug Methods ====================

  /**
   * Get current cache status (for debugging)
   */
  public getCacheStatus(): {
    hasCurrentTopic: boolean
    currentTopicId: string | null
    subscriberCount: number
    lruCache: {
      size: number
      maxSize: number
      topicIds: string[]
      accessOrder: string[]
    }
    allTopicsCache: {
      size: number
      isCacheValid: boolean
      cacheAge: number | null
    }
  } {
    const cacheAge = this.allTopicsCacheTimestamp !== null ? Date.now() - this.allTopicsCacheTimestamp : null

    return {
      hasCurrentTopic: this.currentTopicCache !== null,
      currentTopicId: this.currentTopicCache?.id || null,
      subscriberCount: this.currentTopicSubscribers.size,
      lruCache: {
        size: this.topicCache.size,
        maxSize: this.MAX_CACHE_SIZE,
        topicIds: Array.from(this.topicCache.keys()),
        accessOrder: [...this.accessOrder]
      },
      allTopicsCache: {
        size: this.allTopicsCache.size,
        isCacheValid:
          this.allTopicsCacheTimestamp !== null && Date.now() - this.allTopicsCacheTimestamp < this.CACHE_TTL,
        cacheAge
      }
    }
  }

  /**
   * Print detailed cache status to console (for debugging)
   */
  public logCacheStatus(): void {
    const status = this.getCacheStatus()

    logger.info('==================== TopicService Cache Status ====================')
    logger.info('Current Topic:', status.currentTopicId || 'None')
    logger.info('Current Topic Subscribers:', status.subscriberCount)
    logger.info('')
    logger.info('LRU Cache:')
    logger.info(`  - Size: ${status.lruCache.size}/${status.lruCache.maxSize}`)
    logger.info(`  - Cached Topics: [${status.lruCache.topicIds.join(', ')}]`)
    logger.info(`  - Access Order (oldest→newest): [${status.lruCache.accessOrder.join(', ')}]`)
    logger.info('')
    logger.info('All Topics Cache:')
    logger.info(`  - Size: ${status.allTopicsCache.size}`)
    logger.info(`  - Valid: ${status.allTopicsCache.isCacheValid}`)
    if (status.allTopicsCache.cacheAge !== null) {
      logger.info(`  - Age: ${Math.round(status.allTopicsCache.cacheAge / 1000)}s`)
    }
    logger.info('================================================================')
  }
}

// ==================== Exported Singleton Instance ====================

/**
 * Singleton instance of TopicService
 *
 * Use this instance throughout the application for topic management.
 *
 * @example
 * ```typescript
 * import { topicService } from '@/services/TopicService'
 *
 * const currentTopic = topicService.getCurrentTopic()
 * await topicService.createTopic(assistant)
 * await topicService.switchToTopic(topicId)
 * ```
 */
export const topicService = TopicService.getInstance()

// ==================== Legacy Function Exports (Backward Compatibility) ====================

/**
 * Create a new topic
 * @deprecated Use topicService.createTopic() instead
 */
export async function createNewTopic(assistant: Assistant): Promise<Topic> {
  return await topicService.createTopic(assistant)
}

/**
 * Get the newest topic
 * @deprecated Use topicService.getNewestTopic() instead
 */
export async function getNewestTopic(): Promise<Topic | null> {
  return await topicService.getNewestTopic()
}

/**
 * Rename a topic
 * @deprecated Use topicService.renameTopic() instead
 */
export async function renameTopic(topicId: string, newName: string): Promise<void> {
  return await topicService.renameTopic(topicId, newName)
}
