/**
 * AssistantService - Unified assistant management service with caching and optimistic updates
 *
 * Design Principles:
 * 1. Singleton Pattern - Global unique instance with shared cache
 * 2. System Assistants Cache - Permanent cache for system assistants (default, quick, translate)
 * 3. LRU Cache - Cache recently used assistants to minimize database queries
 * 4. Type Safety - Full generic support with automatic type inference
 * 5. Observer Pattern - Integrated with React's useSyncExternalStore
 * 6. Optimistic Updates - Immediate UI response with background persistence
 *
 * Architecture:
 * ```
 * React Components
 *   ↓ useAssistant / useAssistants
 * React Hooks (useSyncExternalStore)
 *   ↓ subscribe / getSnapshot
 * AssistantService (This File)
 *   • System Assistants Cache (default, quick, translate)
 *   • LRU Cache (10 most recent assistants)
 *   • Subscription Management (Map<assistantId, Set<callback>>)
 *   • Error Handling + Logging
 *   ↓
 * assistantDatabase → SQLite
 * ```
 */

import { assistantDatabase } from '@database'

import { getBuiltInAssistants } from '@/config/assistants'
import { SYSTEM_MODELS } from '@/config/models/default'
import {
  DEFAULT_CONTEXTCOUNT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MAX_CONTEXT_COUNT,
  UNLIMITED_CONTEXT_COUNT
} from '@/constants'
import i18n from '@/i18n'
import { loggerService } from '@/services/LoggerService'
import type { Assistant, AssistantSettings } from '@/types/assistant'
import { uuid } from '@/utils'

const logger = loggerService.withContext('AssistantService')

/**
 * Unsubscribe function returned by subscribe methods
 */
type UnsubscribeFunction = () => void

/**
 * System assistant IDs that are permanently cached
 */
const SYSTEM_ASSISTANT_IDS = ['default', 'quick', 'translate'] as const

/**
 * AssistantService - Singleton service for managing assistants with caching and optimistic updates
 */
export class AssistantService {
  // ==================== Singleton ====================
  private static instance: AssistantService

  private constructor() {
    logger.debug('AssistantService instance created')
  }

  /**
   * Get the singleton instance of AssistantService
   */
  public static getInstance(): AssistantService {
    if (!AssistantService.instance) {
      AssistantService.instance = new AssistantService()
    }
    return AssistantService.instance
  }

  // ==================== Core Storage ====================

  /**
   * Permanent cache for system assistants (default, quick, translate)
   * These are frequently used and should never be evicted
   */
  private systemAssistantsCache = new Map<string, Assistant>()

  /**
   * LRU Cache for recently accessed assistants
   * Max size: 10 assistants
   */
  private assistantCache = new Map<string, Assistant>()

  /**
   * Maximum number of assistants to cache (excluding system assistants)
   */
  private readonly MAX_CACHE_SIZE = 10

  /**
   * Access order tracking for LRU eviction
   * Most recently accessed at the end
   */
  private accessOrder: string[] = []

  /**
   * Promise for ongoing load operations per assistant
   * Key: assistantId, Value: Promise
   */
  private loadPromises = new Map<string, Promise<Assistant | null>>()

  /**
   * Cache for all assistants (Map for O(1) lookup by ID)
   * Key: assistant ID, Value: Assistant object
   */
  private allAssistantsCache = new Map<string, Assistant>()

  /**
   * Timestamp when all assistants were last loaded from database
   */
  private allAssistantsCacheTimestamp: number | null = null

  /**
   * Cache time-to-live in milliseconds (5 minutes)
   */
  private readonly CACHE_TTL = 5 * 60 * 1000

  /**
   * Flag indicating if all assistants are being loaded
   */
  private isLoadingAllAssistants = false

  /**
   * Promise for ongoing load all assistants operation
   */
  private loadAllAssistantsPromise: Promise<Assistant[]> | null = null

  /**
   * Built-in assistants cache (loaded from config)
   */
  private builtInAssistantsCache: Assistant[] = []

  // ==================== Subscription System ====================

  /**
   * Subscribers for specific assistant changes
   * Key: assistantId, Value: Set of callback functions
   */
  private assistantSubscribers = new Map<string, Set<() => void>>()

  /**
   * Global subscribers that listen to all assistant changes
   */
  private globalSubscribers = new Set<() => void>()

  /**
   * Subscribers for all assistants list changes
   */
  private allAssistantsSubscribers = new Set<() => void>()

  /**
   * Subscribers for built-in assistants changes
   */
  private builtInAssistantsSubscribers = new Set<() => void>()

  // ==================== Concurrency Control ====================

  /**
   * Update queue to ensure sequential writes for each assistant
   */
  private updateQueue = new Map<string, Promise<void>>()

  // ==================== Public API: CRUD Operations ====================

  /**
   * Get an assistant by ID with caching (async)
   *
   * This method implements smart caching:
   * 1. Check system assistants cache → return if cached
   * 2. Check LRU cache → return if cached
   * 3. Load from database → cache and return
   *
   * @param assistantId - The assistant ID
   * @returns Promise resolving to the assistant or null
   */
  public async getAssistant(assistantId: string): Promise<Assistant | null> {
    // Validate assistantId
    if (!assistantId || assistantId.trim() === '') {
      logger.warn('getAssistant called with empty assistantId')
      return null
    }

    // 1. Check system assistants cache
    if (this.systemAssistantsCache.has(assistantId)) {
      logger.verbose(`Returning system assistant from cache: ${assistantId}`)
      return this.systemAssistantsCache.get(assistantId)!
    }

    // 2. Check LRU cache
    if (this.assistantCache.has(assistantId)) {
      logger.verbose(`LRU cache hit for assistant: ${assistantId}`)
      const assistant = this.assistantCache.get(assistantId)!
      this.updateAccessOrder(assistantId)
      return assistant
    }

    // 3. Check if already loading
    if (this.loadPromises.has(assistantId)) {
      logger.verbose(`Waiting for ongoing load: ${assistantId}`)
      return await this.loadPromises.get(assistantId)!
    }

    // 4. Load from database
    logger.debug(`Loading assistant from database: ${assistantId}`)
    const loadPromise = this.loadAssistantFromDatabase(assistantId)
    this.loadPromises.set(assistantId, loadPromise)

    try {
      const assistant = await loadPromise
      return assistant
    } finally {
      this.loadPromises.delete(assistantId)
    }
  }

  /**
   * Get an assistant by ID synchronously (from cache only)
   *
   * Returns immediately from cache. Returns null if not cached.
   *
   * @param assistantId - The assistant ID
   * @returns The cached assistant or null
   */
  public getAssistantCached(assistantId: string): Assistant | null {
    // Check system assistants cache
    if (this.systemAssistantsCache.has(assistantId)) {
      return this.systemAssistantsCache.get(assistantId)!
    }

    // Check LRU cache
    if (this.assistantCache.has(assistantId)) {
      const assistant = this.assistantCache.get(assistantId)!
      this.updateAccessOrder(assistantId)
      return assistant
    }

    // Check all assistants cache
    if (this.allAssistantsCache.has(assistantId)) {
      return this.allAssistantsCache.get(assistantId)!
    }

    return null
  }

  /**
   * Create a new assistant (optimistic)
   *
   * Creates assistant immediately in memory, then persists to database.
   *
   * @param assistant - The assistant to create
   * @returns The created assistant
   */
  public async createAssistant(assistant: Assistant): Promise<Assistant> {
    const newAssistant: Assistant = {
      ...assistant,
      id: assistant.id || uuid()
    }

    logger.info('Creating new assistant (optimistic):', newAssistant.id)

    // Optimistic: return immediately
    // Background: save to database
    this.performAssistantCreate(newAssistant).catch(error => {
      logger.error('Failed to persist new assistant:', error as Error)
    })

    return newAssistant
  }

  /**
   * Update an assistant (optimistic)
   *
   * Updates immediately in cache, then persists.
   *
   * @param assistantId - The assistant ID to update
   * @param updates - Partial assistant data to update
   */
  public async updateAssistant(assistantId: string, updates: Partial<Omit<Assistant, 'id'>>): Promise<void> {
    // Wait for any ongoing update to the same assistant
    const previousUpdate = this.updateQueue.get(assistantId)
    if (previousUpdate) {
      await previousUpdate
    }

    // Execute current update
    const currentUpdate = this.performAssistantUpdate(assistantId, updates)
    this.updateQueue.set(assistantId, currentUpdate)

    try {
      await currentUpdate
    } finally {
      // Clean up queue
      if (this.updateQueue.get(assistantId) === currentUpdate) {
        this.updateQueue.delete(assistantId)
      }
    }
  }

  /**
   * Delete an assistant (optimistic)
   *
   * Removes from cache, then deletes from database.
   *
   * @param assistantId - The assistant ID to delete
   */
  public async deleteAssistant(assistantId: string): Promise<void> {
    logger.info('Deleting assistant (optimistic):', assistantId)

    const oldCachedAssistant = this.allAssistantsCache.get(assistantId)

    // Remove from all caches
    this.removeAssistantFromCache(assistantId)

    try {
      // Delete from database
      await assistantDatabase.deleteAssistantById(assistantId)

      // Notify subscribers
      this.notifyAssistantSubscribers(assistantId)
      this.notifyGlobalSubscribers()
      this.notifyAllAssistantsSubscribers()

      logger.info('Assistant deleted successfully:', assistantId)
    } catch (error) {
      // Rollback if failed
      logger.error('Failed to delete assistant, rolling back:', error as Error)
      if (oldCachedAssistant) {
        this.allAssistantsCache.set(assistantId, oldCachedAssistant)
      }
      throw error
    }
  }

  // ==================== Public API: Query Operations ====================

  /**
   * Get all assistants with caching
   *
   * @param forceRefresh - Force reload from database
   * @returns Promise resolving to array of all assistants
   */
  public async getAllAssistants(forceRefresh = false): Promise<Assistant[]> {
    // Check if cache is valid
    const isCacheValid =
      !forceRefresh &&
      this.allAssistantsCacheTimestamp !== null &&
      Date.now() - this.allAssistantsCacheTimestamp < this.CACHE_TTL &&
      this.allAssistantsCache.size > 0

    if (isCacheValid) {
      logger.verbose('Returning cached assistants, cache size:', this.allAssistantsCache.size)
      return Array.from(this.allAssistantsCache.values())
    }

    // If already loading, wait for ongoing load
    if (this.isLoadingAllAssistants && this.loadAllAssistantsPromise) {
      logger.verbose('Waiting for ongoing getAllAssistants operation')
      return await this.loadAllAssistantsPromise
    }

    // Load from database
    return await this.loadAllAssistantsFromDatabase()
  }

  /**
   * Get all assistants from cache (synchronous)
   *
   * @returns Array of cached assistants
   */
  public getAllAssistantsCached(): Assistant[] {
    return Array.from(this.allAssistantsCache.values())
  }

  /**
   * Get external assistants (user-created)
   */
  public async getExternalAssistants(): Promise<Assistant[]> {
    const assistants = await assistantDatabase.getExternalAssistants()
    return assistants
  }

  /**
   * Get built-in assistants (from config)
   */
  public getBuiltInAssistants(): Assistant[] {
    if (this.builtInAssistantsCache.length === 0) {
      this.builtInAssistantsCache = getBuiltInAssistants()
    }
    return this.builtInAssistantsCache
  }

  /**
   * Reset built-in assistants to default
   */
  public resetBuiltInAssistants(): void {
    this.builtInAssistantsCache = getBuiltInAssistants()
    this.notifyBuiltInAssistantsSubscribers()
    logger.info('Built-in assistants reset to default')
  }

  /**
   * Refresh all assistants cache from database
   */
  public async refreshAllAssistantsCache(): Promise<Assistant[]> {
    logger.info('Manually refreshing all assistants cache')
    return await this.getAllAssistants(true)
  }

  /**
   * Invalidate all assistants cache
   */
  public invalidateCache(): void {
    this.allAssistantsCache.clear()
    this.allAssistantsCacheTimestamp = null
    logger.info('All assistants cache invalidated')
    this.notifyAllAssistantsSubscribers()
  }

  // ==================== Public API: Subscription ====================

  /**
   * Subscribe to changes for a specific assistant
   */
  public subscribeAssistant(assistantId: string, callback: () => void): UnsubscribeFunction {
    if (!this.assistantSubscribers.has(assistantId)) {
      this.assistantSubscribers.set(assistantId, new Set())
    }

    const subscribers = this.assistantSubscribers.get(assistantId)!
    subscribers.add(callback)

    logger.verbose(`Added subscriber for assistant ${assistantId}, total: ${subscribers.size}`)

    return () => {
      subscribers.delete(callback)

      if (subscribers.size === 0) {
        this.assistantSubscribers.delete(assistantId)
        logger.verbose(`Removed last subscriber for assistant ${assistantId}, cleaned up`)
      } else {
        logger.verbose(`Removed subscriber for assistant ${assistantId}, remaining: ${subscribers.size}`)
      }
    }
  }

  /**
   * Subscribe to all assistant changes
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
   * Subscribe to all assistants list changes
   */
  public subscribeAllAssistants(callback: () => void): UnsubscribeFunction {
    this.allAssistantsSubscribers.add(callback)
    logger.verbose(`Added all assistants subscriber, total: ${this.allAssistantsSubscribers.size}`)

    return () => {
      this.allAssistantsSubscribers.delete(callback)
      logger.verbose(`Removed all assistants subscriber, remaining: ${this.allAssistantsSubscribers.size}`)
    }
  }

  /**
   * Subscribe to built-in assistants changes
   */
  public subscribeBuiltInAssistants(callback: () => void): UnsubscribeFunction {
    this.builtInAssistantsSubscribers.add(callback)
    logger.verbose(`Added built-in assistants subscriber, total: ${this.builtInAssistantsSubscribers.size}`)

    return () => {
      this.builtInAssistantsSubscribers.delete(callback)
      logger.verbose(`Removed built-in assistants subscriber, remaining: ${this.builtInAssistantsSubscribers.size}`)
    }
  }

  // ==================== Private Methods: Database Operations ====================

  /**
   * Load assistant from database and add to cache
   */
  private async loadAssistantFromDatabase(assistantId: string): Promise<Assistant | null> {
    try {
      const assistant = await assistantDatabase.getAssistantById(assistantId)

      if (assistant) {
        // Add to appropriate cache
        if (SYSTEM_ASSISTANT_IDS.includes(assistantId as any)) {
          this.systemAssistantsCache.set(assistantId, assistant)
          logger.debug(`Loaded system assistant and cached: ${assistantId}`)
        } else {
          this.addToCache(assistantId, assistant)
          logger.debug(`Loaded assistant from database and cached: ${assistantId}`)
        }
        return assistant
      } else {
        logger.warn(`Assistant ${assistantId} not found in database`)
        return null
      }
    } catch (error) {
      logger.error(`Failed to load assistant ${assistantId} from database:`, error as Error)
      return null
    }
  }

  /**
   * Load all assistants from database and update cache
   */
  private async loadAllAssistantsFromDatabase(): Promise<Assistant[]> {
    if (this.isLoadingAllAssistants && this.loadAllAssistantsPromise) {
      logger.verbose('Waiting for ongoing loadAllAssistants operation')
      return await this.loadAllAssistantsPromise
    }

    this.isLoadingAllAssistants = true
    this.loadAllAssistantsPromise = (async () => {
      try {
        logger.info('Loading all assistants from database')
        const assistants = await assistantDatabase.getAllAssistants()

        // Update cache
        this.allAssistantsCache.clear()
        assistants.forEach(assistant => {
          this.allAssistantsCache.set(assistant.id, assistant)
        })

        // Update timestamp
        this.allAssistantsCacheTimestamp = Date.now()

        logger.info(`Loaded ${assistants.length} assistants into cache`)

        // Notify subscribers
        this.notifyAllAssistantsSubscribers()

        return assistants
      } catch (error) {
        logger.error('Failed to load all assistants from database:', error as Error)
        throw error
      } finally {
        this.isLoadingAllAssistants = false
        this.loadAllAssistantsPromise = null
      }
    })()

    return await this.loadAllAssistantsPromise
  }

  /**
   * Perform assistant creation with error handling
   */
  private async performAssistantCreate(assistant: Assistant): Promise<void> {
    try {
      await assistantDatabase.upsertAssistants([assistant])
      logger.debug(`Assistant created successfully: ${assistant.id}`)

      // Update cache if it exists
      if (this.allAssistantsCache.size > 0 || this.allAssistantsCacheTimestamp !== null) {
        this.allAssistantsCache.set(assistant.id, assistant)
        logger.verbose(`Added new assistant to cache: ${assistant.id}`)
      }

      // Notify subscribers
      this.notifyAssistantSubscribers(assistant.id)
      this.notifyGlobalSubscribers()
      this.notifyAllAssistantsSubscribers()
    } catch (error) {
      logger.error(`Failed to create assistant ${assistant.id}:`, error as Error)
      throw error
    }
  }

  /**
   * Perform optimistic assistant update with rollback on failure
   */
  private async performAssistantUpdate(assistantId: string, updates: Partial<Omit<Assistant, 'id'>>): Promise<void> {
    // Save old data for rollback
    const oldSystemAssistant = this.systemAssistantsCache.get(assistantId)
      ? { ...this.systemAssistantsCache.get(assistantId)! }
      : null
    const oldLRUAssistant = this.assistantCache.get(assistantId) ? { ...this.assistantCache.get(assistantId)! } : null
    const oldAllAssistant = this.allAssistantsCache.get(assistantId)
      ? { ...this.allAssistantsCache.get(assistantId)! }
      : null

    try {
      // Fetch current assistant data
      let currentAssistantData: Assistant

      if (this.systemAssistantsCache.has(assistantId)) {
        currentAssistantData = this.systemAssistantsCache.get(assistantId)!
      } else if (this.assistantCache.has(assistantId)) {
        currentAssistantData = this.assistantCache.get(assistantId)!
      } else if (this.allAssistantsCache.has(assistantId)) {
        currentAssistantData = this.allAssistantsCache.get(assistantId)!
      } else {
        const assistant = await assistantDatabase.getAssistantById(assistantId)
        if (!assistant) {
          throw new Error(`Assistant with ID ${assistantId} not found`)
        }
        currentAssistantData = assistant
      }

      // Prepare updated assistant
      const updatedAssistant: Assistant = {
        ...currentAssistantData,
        ...updates,
        id: assistantId
      }

      // Optimistic update: update all caches
      this.updateAssistantInCache(assistantId, updatedAssistant)

      // Notify subscribers (UI updates immediately)
      this.notifyAssistantSubscribers(assistantId)

      // Persist to database
      await assistantDatabase.upsertAssistants([updatedAssistant])

      // Notify other subscribers
      this.notifyGlobalSubscribers()
      this.notifyAllAssistantsSubscribers()

      logger.debug(`Assistant updated successfully: ${assistantId}`)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to update assistant, rolling back:', error as Error)

      if (oldSystemAssistant) {
        this.systemAssistantsCache.set(assistantId, oldSystemAssistant)
      } else {
        this.systemAssistantsCache.delete(assistantId)
      }

      if (oldLRUAssistant) {
        this.assistantCache.set(assistantId, oldLRUAssistant)
      } else {
        this.assistantCache.delete(assistantId)
      }

      if (oldAllAssistant) {
        this.allAssistantsCache.set(assistantId, oldAllAssistant)
      } else {
        this.allAssistantsCache.delete(assistantId)
      }

      this.notifyAssistantSubscribers(assistantId)

      throw error
    }
  }

  // ==================== Private Methods: Notification ====================

  private notifyAssistantSubscribers(assistantId: string): void {
    const subscribers = this.assistantSubscribers.get(assistantId)
    if (subscribers && subscribers.size > 0) {
      logger.verbose(`Notifying ${subscribers.size} subscribers for assistant ${assistantId}`)
      subscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error(`Error in assistant ${assistantId} subscriber callback:`, error as Error)
        }
      })
    }
  }

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

  private notifyAllAssistantsSubscribers(): void {
    if (this.allAssistantsSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.allAssistantsSubscribers.size} all assistants subscribers`)
      this.allAssistantsSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in all assistants subscriber callback:', error as Error)
        }
      })
    }
  }

  private notifyBuiltInAssistantsSubscribers(): void {
    if (this.builtInAssistantsSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.builtInAssistantsSubscribers.size} built-in assistants subscribers`)
      this.builtInAssistantsSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in built-in assistants subscriber callback:', error as Error)
        }
      })
    }
  }

  // ==================== Private Methods: LRU Cache Management ====================

  private addToCache(assistantId: string, assistant: Assistant): void {
    // Don't cache system assistants in LRU (they have their own cache)
    if (SYSTEM_ASSISTANT_IDS.includes(assistantId as any)) {
      logger.verbose(`Skipping LRU cache for system assistant: ${assistantId}`)
      return
    }

    // If cache is full and assistant is not already cached, evict oldest
    if (!this.assistantCache.has(assistantId) && this.assistantCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestFromCache()
    }

    // Add or update in cache
    this.assistantCache.set(assistantId, assistant)

    // Update access order
    this.updateAccessOrder(assistantId)

    logger.verbose(`Added assistant to LRU cache: ${assistantId} (cache size: ${this.assistantCache.size})`)
  }

  private updateAccessOrder(assistantId: string): void {
    const index = this.accessOrder.indexOf(assistantId)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(assistantId)
  }

  private evictOldestFromCache(): void {
    if (this.accessOrder.length === 0) {
      logger.warn('Attempted to evict from empty LRU cache')
      return
    }

    const oldestAssistantId = this.accessOrder.shift()!
    this.assistantCache.delete(oldestAssistantId)

    logger.debug(`Evicted oldest assistant from LRU cache: ${oldestAssistantId}`)
  }

  private updateAssistantInCache(assistantId: string, updatedAssistant: Assistant): void {
    // Update system assistants cache
    if (this.systemAssistantsCache.has(assistantId)) {
      this.systemAssistantsCache.set(assistantId, updatedAssistant)
      logger.verbose(`Updated system assistant cache: ${assistantId}`)
    }

    // Update LRU cache
    if (this.assistantCache.has(assistantId)) {
      this.assistantCache.set(assistantId, updatedAssistant)
      this.updateAccessOrder(assistantId)
      logger.verbose(`Updated LRU cache for assistant: ${assistantId}`)
    }

    // Update all assistants cache
    if (this.allAssistantsCache.has(assistantId)) {
      this.allAssistantsCache.set(assistantId, updatedAssistant)
      logger.verbose(`Updated all assistants cache for assistant: ${assistantId}`)
    }
  }

  private removeAssistantFromCache(assistantId: string): void {
    // Remove from system assistants cache
    if (this.systemAssistantsCache.has(assistantId)) {
      this.systemAssistantsCache.delete(assistantId)
      logger.verbose(`Removed system assistant cache: ${assistantId}`)
    }

    // Remove from LRU cache
    if (this.assistantCache.has(assistantId)) {
      this.assistantCache.delete(assistantId)
      const index = this.accessOrder.indexOf(assistantId)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      logger.verbose(`Removed from LRU cache: ${assistantId}`)
    }

    // Remove from all assistants cache
    if (this.allAssistantsCache.has(assistantId)) {
      this.allAssistantsCache.delete(assistantId)
      logger.verbose(`Removed from all assistants cache: ${assistantId}`)
    }
  }
}

// ==================== Exported Singleton Instance ====================

export const assistantService = AssistantService.getInstance()

// ==================== Utility Functions ====================

/**
 * Get default assistant
 */
export async function getDefaultAssistant(): Promise<Assistant> {
  return (await assistantService.getAssistant('default'))!
}

/**
 * Get default model
 */
export function getDefaultModel() {
  return SYSTEM_MODELS.cherryin[0]
}

/**
 * Get assistant settings with defaults
 */
export const getAssistantSettings = (assistant: Assistant): AssistantSettings => {
  const contextCount = assistant?.settings?.contextCount ?? DEFAULT_CONTEXTCOUNT

  const getAssistantMaxTokens = () => {
    if (assistant.settings?.enableMaxTokens) {
      const maxTokens = assistant.settings.maxTokens

      if (typeof maxTokens === 'number') {
        return maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS
      }

      return DEFAULT_MAX_TOKENS
    }

    return undefined
  }

  return {
    contextCount: contextCount === MAX_CONTEXT_COUNT ? UNLIMITED_CONTEXT_COUNT : contextCount,
    temperature: assistant?.settings?.temperature ?? DEFAULT_TEMPERATURE,
    enableTemperature: assistant?.settings?.enableTemperature ?? true,
    topP: assistant?.settings?.topP ?? 1,
    enableTopP: assistant?.settings?.enableTopP ?? true,
    enableMaxTokens: assistant?.settings?.enableMaxTokens ?? false,
    maxTokens: getAssistantMaxTokens(),
    streamOutput: assistant?.settings?.streamOutput ?? true,
    toolUseMode: assistant?.settings?.toolUseMode ?? 'prompt',
    defaultModel: assistant?.defaultModel ?? undefined,
    reasoning_effort: assistant?.settings?.reasoning_effort ?? undefined,
    customParameters: assistant?.settings?.customParameters ?? []
  }
}

/**
 * Create a new assistant
 */
export async function createAssistant(): Promise<Assistant> {
  const newAssistant: Assistant = {
    id: uuid(),
    emoji: '⭐',
    name: i18n.t('settings.assistant.title'),
    prompt: '',
    topics: [],
    type: 'external',
    settings: {
      toolUseMode: 'function'
    }
  }

  await assistantService.createAssistant(newAssistant)
  return newAssistant
}
