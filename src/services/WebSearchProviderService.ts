/**
 * WebSearchProviderService - Unified WebSearch provider management service with optimistic updates
 *
 * Design Principles:
 * 1. Singleton Pattern - Global unique instance with shared cache
 * 2. LRU Cache - Cache recently accessed WebSearch providers (5 providers)
 * 3. Type Safety - Full generic support with automatic type inference
 * 4. Observer Pattern - Integrated with React's useSyncExternalStore
 * 5. Optimistic Updates - Immediate UI response with background persistence
 *
 * Architecture:
 * ```
 * React Components
 *   ↓ useWebSearchProvider / useWebsearchProviders
 * React Hooks (useSyncExternalStore)
 *   ↓ subscribe / getSnapshot
 * WebSearchProviderService (This File)
 *   • LRU Cache (5 WebSearch providers)
 *   • All WebSearch Providers Cache (TTL: 5min)
 *   • Subscription Management (Map<providerId, Set<callback>>)
 *   • Request Queue (Concurrency Control)
 *   • Error Handling + Logging
 *   ↓
 * websearchProviderDatabase → SQLite
 * ```
 *
 * Cache Strategy:
 * - LRU Cache: 5 recently accessed WebSearch providers
 * - All WebSearch Providers Cache: All providers with 5-minute TTL
 *
 * @example Basic Usage
 * ```typescript
 * // Get WebSearch provider
 * const provider = await webSearchProviderService.getProvider(id)
 *
 * // Create new WebSearch provider (optimistic)
 * const newProvider = await webSearchProviderService.createProvider(providerData)
 *
 * // Subscribe to WebSearch provider changes
 * const unsubscribe = webSearchProviderService.subscribeProvider(id, () => {
 *   console.log('WebSearch provider changed!')
 * })
 * ```
 */

import { websearchProviderDatabase } from '@database'

import { loggerService } from '@/services/LoggerService'
import type { WebSearchProvider } from '@/types/websearch'

const logger = loggerService.withContext('WebSearchProviderService')

/**
 * Unsubscribe function returned by subscribe methods
 */
type UnsubscribeFunction = () => void

/**
 * WebSearchProviderService - Singleton service for managing WebSearch providers with optimistic updates
 */
export class WebSearchProviderService {
  // ==================== Singleton ====================
  private static instance: WebSearchProviderService

  private constructor() {
    logger.debug('WebSearchProviderService instance created')
  }

  /**
   * Get the singleton instance of WebSearchProviderService
   */
  public static getInstance(): WebSearchProviderService {
    if (!WebSearchProviderService.instance) {
      WebSearchProviderService.instance = new WebSearchProviderService()
    }
    return WebSearchProviderService.instance
  }

  // ==================== Core Storage ====================

  /**
   * LRU Cache for recently accessed WebSearch providers
   * Max size: 5 providers
   *
   * Structure: Map<providerId, WebSearchProvider>
   * When cache size exceeds limit, oldest entry is removed
   */
  private providerCache = new Map<string, WebSearchProvider>()

  /**
   * Maximum number of WebSearch providers to cache
   */
  private readonly MAX_CACHE_SIZE = 5

  /**
   * Access order tracking for LRU eviction
   * Most recently accessed at the end
   */
  private accessOrder: string[] = []

  /**
   * Promise for ongoing load operations per WebSearch provider
   * Key: providerId, Value: Promise
   */
  private loadPromises = new Map<string, Promise<WebSearchProvider | null>>()

  /**
   * Cache for all WebSearch providers (Map for O(1) lookup by ID)
   * Key: WebSearch provider ID
   * Value: WebSearchProvider object
   */
  private allProvidersCache = new Map<string, WebSearchProvider>()

  /**
   * Timestamp when all WebSearch providers were last loaded from database
   * Used for TTL-based cache invalidation
   */
  private allProvidersCacheTimestamp: number | null = null

  /**
   * Cache time-to-live in milliseconds (5 minutes)
   * After this duration, cache is considered stale
   */
  private readonly CACHE_TTL = 5 * 60 * 1000

  /**
   * Flag indicating if all WebSearch providers are being loaded
   */
  private isLoadingAllProviders = false

  /**
   * Promise for ongoing load all WebSearch providers operation
   * Prevents duplicate concurrent loads
   */
  private loadAllProvidersPromise: Promise<WebSearchProvider[]> | null = null

  // ==================== Subscription System ====================

  /**
   * Subscribers for specific WebSearch provider changes
   * Key: providerId
   * Value: Set of callback functions
   */
  private providerSubscribers = new Map<string, Set<() => void>>()

  /**
   * Global subscribers that listen to all WebSearch provider changes
   */
  private globalSubscribers = new Set<() => void>()

  /**
   * Subscribers for all WebSearch providers list changes
   * These are notified when the WebSearch providers list changes (create/update/delete)
   * Used by useWebsearchProviders() hook
   */
  private allProvidersSubscribers = new Set<() => void>()

  // ==================== Concurrency Control ====================

  /**
   * Update queue to ensure sequential writes for each WebSearch provider
   * Prevents race conditions when the same WebSearch provider is updated multiple times rapidly
   *
   * Key: providerId
   * Value: Promise of the ongoing update operation
   */
  private updateQueue = new Map<string, Promise<void>>()

  // ==================== Public API: Query Operations ====================

  /**
   * Get a WebSearch provider by ID with LRU caching (async)
   *
   * This method implements smart caching:
   * 1. Check LRU cache → return if cached
   * 2. Load from database → cache and return
   *
   * @param providerId - The WebSearch provider ID
   * @returns Promise resolving to the WebSearch provider or null
   */
  public async getProvider(providerId: string): Promise<WebSearchProvider | null> {
    // 1. Check LRU cache
    if (this.providerCache.has(providerId)) {
      logger.verbose(`LRU cache hit for WebSearch provider: ${providerId}`)
      const provider = this.providerCache.get(providerId)!
      this.updateAccessOrder(providerId)
      return provider
    }

    // 2. Check if already loading
    if (this.loadPromises.has(providerId)) {
      logger.verbose(`Waiting for ongoing load: ${providerId}`)
      return await this.loadPromises.get(providerId)!
    }

    // 3. Load from database
    logger.debug(`Loading WebSearch provider from database: ${providerId}`)
    const loadPromise = this.loadProviderFromDatabase(providerId)
    this.loadPromises.set(providerId, loadPromise)

    try {
      const provider = await loadPromise
      return provider
    } finally {
      this.loadPromises.delete(providerId)
    }
  }

  /**
   * Get a WebSearch provider by ID synchronously (from cache only)
   *
   * Returns immediately from cache. Returns null if not cached.
   *
   * @param providerId - The WebSearch provider ID
   * @returns The cached WebSearch provider or null
   */
  public getProviderCached(providerId: string): WebSearchProvider | null {
    // Check LRU cache
    if (this.providerCache.has(providerId)) {
      const provider = this.providerCache.get(providerId)!
      this.updateAccessOrder(providerId)
      return provider
    }

    // Check all WebSearch providers cache
    if (this.allProvidersCache.has(providerId)) {
      return this.allProvidersCache.get(providerId)!
    }

    return null
  }

  /**
   * Get all WebSearch providers with caching
   *
   * Loads from cache if available and not stale, otherwise loads from database.
   * This is the main method for loading all WebSearch providers with automatic caching.
   *
   * @param forceRefresh - Force reload from database even if cache is valid
   * @returns Promise resolving to array of all WebSearch providers
   */
  public async getAllProviders(forceRefresh = false): Promise<WebSearchProvider[]> {
    // Check if cache is valid
    const isCacheValid =
      !forceRefresh &&
      this.allProvidersCacheTimestamp !== null &&
      Date.now() - this.allProvidersCacheTimestamp < this.CACHE_TTL &&
      this.allProvidersCache.size > 0

    if (isCacheValid) {
      logger.verbose('Returning cached WebSearch providers, cache size:', this.allProvidersCache.size)
      return Array.from(this.allProvidersCache.values())
    }

    // If already loading, wait for ongoing load
    if (this.isLoadingAllProviders && this.loadAllProvidersPromise) {
      logger.verbose('Waiting for ongoing getAllProviders operation')
      return await this.loadAllProvidersPromise
    }

    // Load from database
    return await this.loadAllProvidersFromDatabase()
  }

  /**
   * Get all WebSearch providers from cache (synchronous)
   *
   * Returns cached WebSearch providers immediately. If cache is empty, returns empty array.
   * Used by React's useSyncExternalStore for synchronous snapshot.
   *
   * @returns Array of cached WebSearch providers
   */
  public getAllProvidersCached(): WebSearchProvider[] {
    return Array.from(this.allProvidersCache.values())
  }

  // ==================== Public API: CRUD Operations ====================

  /**
   * Create a new WebSearch provider (optimistic)
   *
   * Creates WebSearch provider immediately in memory, then persists to database.
   *
   * @param provider - The WebSearch provider data
   * @returns The created WebSearch provider
   */
  public async createProvider(provider: WebSearchProvider): Promise<WebSearchProvider> {
    logger.info('Creating new WebSearch provider (optimistic):', provider.id)

    // Optimistic update: add to caches immediately
    if (this.allProvidersCache.size > 0 || this.allProvidersCacheTimestamp !== null) {
      this.allProvidersCache.set(provider.id, provider)
      logger.verbose(`Added new WebSearch provider to cache: ${provider.id}`)
    }

    // Notify subscribers (UI updates immediately)
    this.notifyProviderSubscribers(provider.id)
    this.notifyGlobalSubscribers()
    this.notifyAllProvidersSubscribers()

    try {
      // Persist to database
      await websearchProviderDatabase.upsertWebSearchProviders([provider])
      logger.info('WebSearch provider created successfully:', provider.id)
      return provider
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to create WebSearch provider, rolling back:', error as Error)

      // Remove from cache
      if (this.allProvidersCache.has(provider.id)) {
        this.allProvidersCache.delete(provider.id)
      }

      // Notify subscribers to revert UI
      this.notifyProviderSubscribers(provider.id)
      this.notifyGlobalSubscribers()
      this.notifyAllProvidersSubscribers()

      throw error
    }
  }

  /**
   * Update a WebSearch provider (optimistic)
   *
   * Updates immediately in cache, then persists.
   *
   * @param providerId - The WebSearch provider ID to update
   * @param updates - Partial WebSearch provider data to update
   */
  public async updateProvider(providerId: string, updates: Partial<Omit<WebSearchProvider, 'id'>>): Promise<void> {
    // Wait for any ongoing update to the same WebSearch provider
    const previousUpdate = this.updateQueue.get(providerId)
    if (previousUpdate) {
      await previousUpdate
    }

    // Execute current update
    const currentUpdate = this.performProviderUpdate(providerId, updates)
    this.updateQueue.set(providerId, currentUpdate)

    try {
      await currentUpdate
    } finally {
      // Clean up queue
      if (this.updateQueue.get(providerId) === currentUpdate) {
        this.updateQueue.delete(providerId)
      }
    }
  }

  /**
   * Delete a WebSearch provider (optimistic)
   *
   * Removes from cache, then deletes from database.
   *
   * @param providerId - The WebSearch provider ID to delete
   */
  public async deleteProvider(providerId: string): Promise<void> {
    logger.info('Deleting WebSearch provider (optimistic):', providerId)

    // Save old data for rollback
    const oldCachedProvider = this.allProvidersCache.get(providerId)
    const oldLRUProvider = this.providerCache.get(providerId)

    // Remove from all caches
    if (this.allProvidersCache.has(providerId)) {
      this.allProvidersCache.delete(providerId)
      logger.verbose(`Removed WebSearch provider from all providers cache: ${providerId}`)
    }

    if (this.providerCache.has(providerId)) {
      this.providerCache.delete(providerId)
      const index = this.accessOrder.indexOf(providerId)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      logger.verbose(`Removed WebSearch provider from LRU cache: ${providerId}`)
    }

    // Notify subscribers (UI updates immediately)
    this.notifyProviderSubscribers(providerId)
    this.notifyGlobalSubscribers()
    this.notifyAllProvidersSubscribers()

    try {
      // Delete from database
      await websearchProviderDatabase.deleteWebSearchProvider(providerId)
      logger.info('WebSearch provider deleted successfully:', providerId)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to delete WebSearch provider, rolling back:', error as Error)

      // Restore caches
      if (oldCachedProvider) {
        this.allProvidersCache.set(providerId, oldCachedProvider)
      }
      if (oldLRUProvider) {
        this.providerCache.set(providerId, oldLRUProvider)
        this.accessOrder.push(providerId)
      }

      // Notify subscribers to revert UI
      this.notifyProviderSubscribers(providerId)
      this.notifyGlobalSubscribers()
      this.notifyAllProvidersSubscribers()

      throw error
    }
  }

  // ==================== Public API: Cache Operations ====================

  /**
   * Refresh all WebSearch providers cache from database
   *
   * Forces a reload of all WebSearch providers from database, updating the cache.
   * Useful for pull-to-refresh functionality.
   *
   * @returns Promise resolving to array of refreshed WebSearch providers
   */
  public async refreshAllProvidersCache(): Promise<WebSearchProvider[]> {
    logger.info('Manually refreshing all WebSearch providers cache')
    return await this.getAllProviders(true)
  }

  /**
   * Invalidate all WebSearch providers cache
   *
   * Clears the cache and forces next access to reload from database.
   * Used for logout or data reset scenarios.
   */
  public invalidateCache(): void {
    this.allProvidersCache.clear()
    this.allProvidersCacheTimestamp = null
    this.providerCache.clear()
    this.accessOrder = []
    logger.info('All WebSearch providers cache invalidated')
    this.notifyAllProvidersSubscribers()
  }

  // ==================== Public API: Subscription ====================

  /**
   * Subscribe to changes for a specific WebSearch provider
   *
   * @param providerId - The WebSearch provider ID to watch
   * @param callback - Function to call when the WebSearch provider changes
   * @returns Unsubscribe function
   */
  public subscribeProvider(providerId: string, callback: () => void): UnsubscribeFunction {
    if (!this.providerSubscribers.has(providerId)) {
      this.providerSubscribers.set(providerId, new Set())
    }

    const subscribers = this.providerSubscribers.get(providerId)!
    subscribers.add(callback)

    logger.verbose(`Added subscriber for WebSearch provider ${providerId}, total: ${subscribers.size}`)

    return () => {
      subscribers.delete(callback)

      // Clean up empty subscriber sets
      if (subscribers.size === 0) {
        this.providerSubscribers.delete(providerId)
        logger.verbose(`Removed last subscriber for WebSearch provider ${providerId}, cleaned up`)
      } else {
        logger.verbose(`Removed subscriber for WebSearch provider ${providerId}, remaining: ${subscribers.size}`)
      }
    }
  }

  /**
   * Subscribe to all WebSearch provider changes
   *
   * @param callback - Function to call when any WebSearch provider changes
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
   * Subscribe to all WebSearch providers list changes
   *
   * The callback is invoked whenever the WebSearch providers list changes (create/update/delete).
   * Used by useWebsearchProviders() hook with useSyncExternalStore.
   *
   * @param callback - Function to call when WebSearch providers list changes
   * @returns Unsubscribe function
   */
  public subscribeAllProviders(callback: () => void): UnsubscribeFunction {
    this.allProvidersSubscribers.add(callback)
    logger.verbose(`Added all WebSearch providers subscriber, total: ${this.allProvidersSubscribers.size}`)

    return () => {
      this.allProvidersSubscribers.delete(callback)
      logger.verbose(`Removed all WebSearch providers subscriber, remaining: ${this.allProvidersSubscribers.size}`)
    }
  }

  // ==================== Private Methods: Database Operations ====================

  /**
   * Load a WebSearch provider from database and add to LRU cache
   */
  private async loadProviderFromDatabase(providerId: string): Promise<WebSearchProvider | null> {
    try {
      const provider = await websearchProviderDatabase.getWebSearchProviderById(providerId)

      if (provider) {
        // Add to LRU cache
        this.addToCache(providerId, provider)
        logger.debug(`Loaded WebSearch provider from database and cached: ${providerId}`)
        return provider
      } else {
        logger.warn(`WebSearch provider ${providerId} not found in database`)
        return null
      }
    } catch (error) {
      logger.error(`Failed to load WebSearch provider ${providerId} from database:`, error as Error)
      return null
    }
  }

  /**
   * Load all WebSearch providers from database and update cache
   *
   * This method is called when cache is invalid or forced refresh is requested.
   * It prevents duplicate concurrent loads using a promise flag.
   */
  private async loadAllProvidersFromDatabase(): Promise<WebSearchProvider[]> {
    // If already loading, wait for the ongoing operation
    if (this.isLoadingAllProviders && this.loadAllProvidersPromise) {
      logger.verbose('Waiting for ongoing loadAllProviders operation')
      return await this.loadAllProvidersPromise
    }

    // Start loading
    this.isLoadingAllProviders = true
    this.loadAllProvidersPromise = (async () => {
      try {
        logger.info('Loading all WebSearch providers from database')
        const providers = await websearchProviderDatabase.getAllWebSearchProviders()

        // Update cache
        this.allProvidersCache.clear()
        providers.forEach(provider => {
          this.allProvidersCache.set(provider.id, provider)
        })

        // Update timestamp
        this.allProvidersCacheTimestamp = Date.now()

        logger.info(`Loaded ${providers.length} WebSearch providers into cache`)

        // Notify subscribers
        this.notifyAllProvidersSubscribers()

        return providers
      } catch (error) {
        logger.error('Failed to load all WebSearch providers from database:', error as Error)
        throw error
      } finally {
        this.isLoadingAllProviders = false
        this.loadAllProvidersPromise = null
      }
    })()

    return await this.loadAllProvidersPromise
  }

  /**
   * Perform optimistic WebSearch provider update with rollback on failure
   */
  private async performProviderUpdate(
    providerId: string,
    updates: Partial<Omit<WebSearchProvider, 'id'>>
  ): Promise<void> {
    // Save old data for rollback
    const oldLRUProvider = this.providerCache.get(providerId) ? { ...this.providerCache.get(providerId)! } : null
    const oldAllProvidersProvider = this.allProvidersCache.get(providerId)
      ? { ...this.allProvidersCache.get(providerId)! }
      : null

    try {
      // Fetch current WebSearch provider data
      let currentProviderData: WebSearchProvider

      // Try to get from LRU cache
      if (this.providerCache.has(providerId)) {
        currentProviderData = this.providerCache.get(providerId)!
      }
      // Try to get from all providers cache
      else if (this.allProvidersCache.has(providerId)) {
        currentProviderData = this.allProvidersCache.get(providerId)!
      }
      // Load from database
      else {
        const provider = await websearchProviderDatabase.getWebSearchProviderById(providerId)
        if (!provider) {
          throw new Error(`WebSearch provider with ID ${providerId} not found`)
        }
        currentProviderData = provider
      }

      // Prepare updated provider
      const updatedProvider: WebSearchProvider = {
        ...currentProviderData,
        ...updates,
        id: providerId // Ensure ID is not overwritten
      }

      // Optimistic update: update all caches
      this.updateProviderInCache(providerId, updatedProvider)

      // Notify subscribers (UI updates immediately)
      this.notifyProviderSubscribers(providerId)

      // Persist to database
      await websearchProviderDatabase.upsertWebSearchProviders([updatedProvider])

      // Notify other subscribers
      this.notifyGlobalSubscribers()
      this.notifyAllProvidersSubscribers()

      logger.debug(`WebSearch provider updated successfully: ${providerId}`)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to update WebSearch provider, rolling back:', error as Error)

      // Rollback LRU cache
      if (oldLRUProvider) {
        this.providerCache.set(providerId, oldLRUProvider)
      } else {
        this.providerCache.delete(providerId)
      }

      // Rollback all providers cache
      if (oldAllProvidersProvider) {
        this.allProvidersCache.set(providerId, oldAllProvidersProvider)
      } else {
        this.allProvidersCache.delete(providerId)
      }

      // Notify subscribers to revert UI
      this.notifyProviderSubscribers(providerId)

      throw error
    }
  }

  // ==================== Private Methods: Notification ====================

  /**
   * Notify all subscribers for a specific WebSearch provider
   */
  private notifyProviderSubscribers(providerId: string): void {
    const subscribers = this.providerSubscribers.get(providerId)
    if (subscribers && subscribers.size > 0) {
      logger.verbose(`Notifying ${subscribers.size} subscribers for WebSearch provider ${providerId}`)
      subscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error(`Error in WebSearch provider ${providerId} subscriber callback:`, error as Error)
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
   * Notify all WebSearch providers list subscribers
   *
   * Called when the WebSearch providers list changes (create/update/delete).
   * Used by useWebsearchProviders() hook with useSyncExternalStore.
   */
  private notifyAllProvidersSubscribers(): void {
    if (this.allProvidersSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.allProvidersSubscribers.size} all WebSearch providers subscribers`)
      this.allProvidersSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in all WebSearch providers subscriber callback:', error as Error)
        }
      })
    }
  }

  // ==================== Private Methods: LRU Cache Management ====================

  /**
   * Add or update a WebSearch provider in the LRU cache
   *
   * If cache is full, evicts the oldest entry.
   * Updates access order.
   *
   * @param providerId - The WebSearch provider ID
   * @param provider - The WebSearch provider data
   */
  private addToCache(providerId: string, provider: WebSearchProvider): void {
    // If cache is full and provider is not already cached, evict oldest
    if (!this.providerCache.has(providerId) && this.providerCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestFromCache()
    }

    // Add or update in cache
    this.providerCache.set(providerId, provider)

    // Update access order
    this.updateAccessOrder(providerId)

    logger.verbose(`Added WebSearch provider to LRU cache: ${providerId} (cache size: ${this.providerCache.size})`)
  }

  /**
   * Update access order for LRU eviction
   *
   * Moves the providerId to the end of the access order (most recently used).
   *
   * @param providerId - The WebSearch provider ID to update
   */
  private updateAccessOrder(providerId: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(providerId)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }

    // Add to end (most recently used)
    this.accessOrder.push(providerId)
  }

  /**
   * Evict the oldest (least recently used) WebSearch provider from cache
   */
  private evictOldestFromCache(): void {
    if (this.accessOrder.length === 0) {
      logger.warn('Attempted to evict from empty LRU cache')
      return
    }

    // Get oldest provider (first in access order)
    const oldestProviderId = this.accessOrder.shift()!

    // Remove from cache
    this.providerCache.delete(oldestProviderId)

    logger.debug(`Evicted oldest WebSearch provider from LRU cache: ${oldestProviderId}`)
  }

  /**
   * Update a WebSearch provider in all caches
   *
   * Updates the WebSearch provider in:
   * - providerCache (LRU cache)
   * - allProvidersCache (if exists)
   *
   * @param providerId - The WebSearch provider ID
   * @param updatedProvider - The updated WebSearch provider data
   */
  private updateProviderInCache(providerId: string, updatedProvider: WebSearchProvider): void {
    // Update LRU cache if it exists
    if (this.providerCache.has(providerId)) {
      this.providerCache.set(providerId, updatedProvider)
      this.updateAccessOrder(providerId)
      logger.verbose(`Updated LRU cache for WebSearch provider: ${providerId}`)
    }

    // Update all providers cache if it exists
    if (this.allProvidersCache.has(providerId)) {
      this.allProvidersCache.set(providerId, updatedProvider)
      logger.verbose(`Updated all providers cache for WebSearch provider: ${providerId}`)
    }
  }

  // ==================== Debug Methods ====================

  /**
   * Get current cache status (for debugging)
   */
  public getCacheStatus(): {
    lruCache: {
      size: number
      maxSize: number
      providerIds: string[]
      accessOrder: string[]
    }
    allProvidersCache: {
      size: number
      isCacheValid: boolean
      cacheAge: number | null
    }
  } {
    const cacheAge = this.allProvidersCacheTimestamp !== null ? Date.now() - this.allProvidersCacheTimestamp : null

    return {
      lruCache: {
        size: this.providerCache.size,
        maxSize: this.MAX_CACHE_SIZE,
        providerIds: Array.from(this.providerCache.keys()),
        accessOrder: [...this.accessOrder]
      },
      allProvidersCache: {
        size: this.allProvidersCache.size,
        isCacheValid:
          this.allProvidersCacheTimestamp !== null && Date.now() - this.allProvidersCacheTimestamp < this.CACHE_TTL,
        cacheAge
      }
    }
  }

  /**
   * Print detailed cache status to console (for debugging)
   */
  public logCacheStatus(): void {
    const status = this.getCacheStatus()

    logger.info('==================== WebSearchProviderService Cache Status ====================')
    logger.info('LRU Cache:')
    logger.info(`  - Size: ${status.lruCache.size}/${status.lruCache.maxSize}`)
    logger.info(`  - Cached WebSearch Providers: [${status.lruCache.providerIds.join(', ')}]`)
    logger.info(`  - Access Order (oldest→newest): [${status.lruCache.accessOrder.join(', ')}]`)
    logger.info('')
    logger.info('All WebSearch Providers Cache:')
    logger.info(`  - Size: ${status.allProvidersCache.size}`)
    logger.info(`  - Valid: ${status.allProvidersCache.isCacheValid}`)
    if (status.allProvidersCache.cacheAge !== null) {
      logger.info(`  - Age: ${Math.round(status.allProvidersCache.cacheAge / 1000)}s`)
    }
    logger.info('==============================================================================')
  }
}

// ==================== Exported Singleton Instance ====================

/**
 * Singleton instance of WebSearchProviderService
 *
 * Use this instance throughout the application for WebSearch provider management.
 *
 * @example
 * ```typescript
 * import { webSearchProviderService } from '@/services/WebSearchProviderService'
 *
 * const provider = await webSearchProviderService.getProvider(id)
 * await webSearchProviderService.createProvider(providerData)
 * await webSearchProviderService.updateProvider(id, updates)
 * ```
 */
export const webSearchProviderService = WebSearchProviderService.getInstance()
