/**
 * ProviderService - Unified provider management service with caching and optimistic updates
 *
 * Design Principles:
 * 1. Singleton Pattern - Global unique instance with shared cache
 * 2. Default Provider Cache - Permanent cache for the default provider (most frequently accessed)
 * 3. LRU Cache - Cache recently used providers to minimize database queries
 * 4. Type Safety - Full generic support with automatic type inference
 * 5. Observer Pattern - Integrated with React's useSyncExternalStore
 * 6. Optimistic Updates - Immediate UI response with background persistence
 *
 * Architecture:
 * ```
 * React Components
 *   ↓ useProvider / useProviders
 * React Hooks (useSyncExternalStore)
 *   ↓ subscribe / getSnapshot
 * ProviderService (This File)
 *   • Default Provider Cache (permanent)
 *   • LRU Cache (10 most recent providers)
 *   • All Providers Cache (TTL: 5min)
 *   • Subscription Management (Map<providerId, Set<callback>>)
 *   • Error Handling + Logging
 *   ↓
 * providerDatabase → SQLite
 * ```
 */

import { providerDatabase } from '@database'

import { CHERRYAI_PROVIDER } from '@/config/providers'
import { loggerService } from '@/services/LoggerService'
import type { Assistant, Model, Provider } from '@/types/assistant'

import { getDefaultModel } from './AssistantService'

const logger = loggerService.withContext('ProviderService')

/**
 * Unsubscribe function returned by subscribe methods
 */
type UnsubscribeFunction = () => void

/**
 * Cache status for debugging
 */
export interface ProviderCacheStatus {
  defaultProvider: {
    cached: boolean
    providerId: string | null
  }
  lruCache: {
    size: number
    maxSize: number
    providerIds: string[]
    accessOrder: string[]
  }
  allProvidersCache: {
    size: number
    isValid: boolean
    age: number | null
  }
  subscribers: {
    providerSubscribers: number
    allProvidersSubscribers: number
    globalSubscribers: number
  }
}

/**
 * ProviderService - Singleton service for managing providers with caching and optimistic updates
 */
export class ProviderService {
  // ==================== Singleton ====================
  private static instance: ProviderService

  private constructor() {
    logger.debug('ProviderService instance created')
  }

  /**
   * Get the singleton instance of ProviderService
   */
  public static getInstance(): ProviderService {
    if (!ProviderService.instance) {
      ProviderService.instance = new ProviderService()
    }
    return ProviderService.instance
  }

  // ==================== Core Storage ====================

  /**
   * Permanent cache for default provider
   * This is the most frequently accessed provider
   */
  private defaultProviderCache: Provider | null = null

  /**
   * Flag indicating if default provider has been initialized
   */
  private defaultProviderInitialized = false

  /**
   * LRU Cache for recently accessed providers
   * Max size: 10 providers
   */
  private providerCache = new Map<string, Provider>()

  /**
   * Maximum number of providers to cache (excluding default)
   */
  private readonly MAX_CACHE_SIZE = 10

  /**
   * Access order tracking for LRU eviction
   * Most recently accessed at the end
   */
  private accessOrder: string[] = []

  /**
   * Promise for ongoing load operations per provider
   * Key: providerId, Value: Promise
   */
  private loadPromises = new Map<string, Promise<Provider | null>>()

  /**
   * Cache for all providers (Map for O(1) lookup by ID)
   * Key: provider ID, Value: Provider object
   */
  private allProvidersCache = new Map<string, Provider>()

  /**
   * Timestamp when all providers were last loaded from database
   */
  private allProvidersCacheTimestamp: number | null = null

  /**
   * Cache time-to-live in milliseconds (5 minutes)
   */
  private readonly CACHE_TTL = 5 * 60 * 1000

  /**
   * Flag indicating if all providers are being loaded
   */
  private isLoadingAllProviders = false

  /**
   * Promise for ongoing load all providers operation
   */
  private loadAllProvidersPromise: Promise<Provider[]> | null = null

  // ==================== Subscription System ====================

  /**
   * Subscribers for specific provider changes
   * Key: providerId, Value: Set of callback functions
   */
  private providerSubscribers = new Map<string, Set<() => void>>()

  /**
   * Global subscribers that listen to all provider changes
   */
  private globalSubscribers = new Set<() => void>()

  /**
   * Subscribers for all providers list changes
   */
  private allProvidersSubscribers = new Set<() => void>()

  /**
   * Subscribers for default provider changes
   */
  private defaultProviderSubscribers = new Set<() => void>()

  // ==================== Concurrency Control ====================

  /**
   * Update queue to ensure sequential writes for each provider
   */
  private updateQueue = new Map<string, Promise<void>>()

  // ==================== Initialization ====================

  /**
   * Initialize the service by loading the default provider
   * Should be called during app startup
   */
  public async initialize(): Promise<void> {
    if (this.defaultProviderInitialized) {
      logger.verbose('ProviderService already initialized')
      return
    }

    try {
      logger.info('Initializing ProviderService...')

      // Load default provider
      const defaultModel = getDefaultModel()
      const defaultProviderId = defaultModel.provider

      if (defaultProviderId) {
        const defaultProvider = await this.loadProviderFromDatabase(defaultProviderId)
        if (defaultProvider) {
          this.defaultProviderCache = defaultProvider
          logger.info(`Default provider cached: ${defaultProviderId}`)
        }
      }

      this.defaultProviderInitialized = true
      logger.info('ProviderService initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize ProviderService:', error as Error)
      // Don't throw - app should still work
    }
  }

  // ==================== Public API: CRUD Operations ====================

  /**
   * Get a provider by ID with caching (async)
   *
   * This method implements smart caching:
   * 1. Check if it's the default provider → return from permanent cache
   * 2. Check LRU cache → return if cached
   * 3. Load from database → cache and return
   *
   * @param providerId - The provider ID
   * @returns Promise resolving to the provider or null
   */
  public async getProvider(providerId: string): Promise<Provider | null> {
    // Validate providerId
    if (!providerId || providerId.trim() === '') {
      logger.warn('getProvider called with empty providerId')
      return null
    }

    // 0. Check special provider
    if (providerId === 'cherryai') {
      return CHERRYAI_PROVIDER
    }

    // 1. Check default provider cache
    if (this.defaultProviderCache && this.defaultProviderCache.id === providerId) {
      logger.verbose(`Returning default provider from cache: ${providerId}`)
      return this.defaultProviderCache
    }

    // 2. Check LRU cache
    if (this.providerCache.has(providerId)) {
      logger.verbose(`LRU cache hit for provider: ${providerId}`)
      const provider = this.providerCache.get(providerId)!
      this.updateAccessOrder(providerId)
      return provider
    }

    // 3. Check if already loading
    if (this.loadPromises.has(providerId)) {
      logger.verbose(`Waiting for ongoing load: ${providerId}`)
      return await this.loadPromises.get(providerId)!
    }

    // 4. Load from database
    logger.debug(`Loading provider from database: ${providerId}`)
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
   * Get a provider by ID synchronously (from cache only)
   *
   * Returns immediately from cache. Returns null if not cached.
   * This is optimized for high-frequency synchronous access patterns.
   *
   * @param providerId - The provider ID
   * @returns The cached provider or null
   */
  public getProviderCached(providerId: string): Provider | null {
    if (providerId === 'cherryai') {
      return CHERRYAI_PROVIDER
    }

    // Check default provider cache
    if (this.defaultProviderCache && this.defaultProviderCache.id === providerId) {
      return this.defaultProviderCache
    }

    // Check LRU cache
    if (this.providerCache.has(providerId)) {
      const provider = this.providerCache.get(providerId)!
      this.updateAccessOrder(providerId)
      return provider
    }

    // Check all providers cache
    if (this.allProvidersCache.has(providerId)) {
      return this.allProvidersCache.get(providerId)!
    }

    return null
  }

  /**
   * Get provider by model (synchronous, high-frequency)
   *
   * This is the most frequently called method, optimized for performance.
   *
   * @param model - The model object
   * @returns The provider or throws error if not found
   */
  public getProviderByModel(model: Model): Provider {
    const provider = this.getProviderCached(model.provider)

    if (!provider) {
      // Fallback to sync database query (should rarely happen after initialization)
      const dbProvider = providerDatabase.getProviderByIdSync(model.provider)
      if (!dbProvider) {
        throw new Error(`Provider not found: ${model.provider}`)
      }

      // Cache it for next time
      this.addToCache(dbProvider.id, dbProvider)
      return dbProvider
    }

    return provider
  }

  /**
   * Get the default provider (synchronous)
   *
   * Returns the default provider from permanent cache.
   * Throws error if not initialized.
   *
   * @returns The default provider
   */
  public getDefaultProvider(): Provider {
    if (!this.defaultProviderCache) {
      // Fallback: get from database
      const defaultModel = getDefaultModel()
      const provider = providerDatabase.getProviderByIdSync(defaultModel.provider)
      if (!provider) {
        throw new Error('Default provider not found')
      }
      this.defaultProviderCache = provider
      return provider
    }

    return this.defaultProviderCache
  }

  /**
   * Create a new provider (optimistic)
   *
   * Creates provider immediately in memory, then persists to database.
   *
   * @param provider - The provider to create
   * @returns The created provider
   */
  public async createProvider(provider: Provider): Promise<Provider> {
    logger.info('Creating new provider (optimistic):', provider.id)

    // Optimistic: return immediately
    // Background: save to database
    this.performProviderCreate(provider).catch(error => {
      logger.error('Failed to persist new provider:', error as Error)
    })

    return provider
  }

  /**
   * Update a provider (optimistic)
   *
   * Updates immediately in cache, then persists.
   *
   * @param providerId - The provider ID to update
   * @param updates - Partial provider data to update
   */
  public async updateProvider(providerId: string, updates: Partial<Omit<Provider, 'id'>>): Promise<void> {
    // Wait for any ongoing update to the same provider
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
   * Delete a provider (optimistic)
   *
   * Removes from cache, then deletes from database.
   *
   * @param providerId - The provider ID to delete
   */
  public async deleteProvider(providerId: string): Promise<void> {
    logger.info('Deleting provider (optimistic):', providerId)

    const oldCachedProvider = this.allProvidersCache.get(providerId)

    // Remove from all caches
    this.removeProviderFromCache(providerId)

    try {
      // Delete from database
      await providerDatabase.deleteProvider(providerId)

      // Notify subscribers
      this.notifyProviderSubscribers(providerId)
      this.notifyGlobalSubscribers()
      this.notifyAllProvidersSubscribers()

      logger.info('Provider deleted successfully:', providerId)
    } catch (error) {
      // Rollback if failed
      logger.error('Failed to delete provider, rolling back:', error as Error)
      if (oldCachedProvider) {
        this.allProvidersCache.set(providerId, oldCachedProvider)
      }
      throw error
    }
  }

  // ==================== Public API: Query Operations ====================

  /**
   * Get all providers with caching
   *
   * @param forceRefresh - Force reload from database
   * @returns Promise resolving to array of all providers
   */
  public async getAllProviders(forceRefresh = false): Promise<Provider[]> {
    // Check if cache is valid
    const isCacheValid =
      !forceRefresh &&
      this.allProvidersCacheTimestamp !== null &&
      Date.now() - this.allProvidersCacheTimestamp < this.CACHE_TTL &&
      this.allProvidersCache.size > 0

    if (isCacheValid) {
      logger.verbose('Returning cached providers, cache size:', this.allProvidersCache.size)
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
   * Get all providers from cache (synchronous)
   *
   * @returns Array of cached providers
   */
  public getAllProvidersCached(): Provider[] {
    // If cache is still valid, return it
    const isCacheValid =
      this.allProvidersCacheTimestamp !== null &&
      Date.now() - this.allProvidersCacheTimestamp < this.CACHE_TTL &&
      this.allProvidersCache.size > 0

    if (isCacheValid) {
      return Array.from(this.allProvidersCache.values())
    }

    // Cache is stale or empty, trigger background load
    this.getAllProviders().catch(error => {
      logger.error('Background load of providers failed:', error as Error)
    })

    // Return current cache content (may be stale or empty)
    return Array.from(this.allProvidersCache.values())
  }

  /**
   * Get provider for assistant
   *
   * @param assistant - The assistant
   * @returns Promise resolving to the provider
   */
  public async getAssistantProvider(assistant: Assistant): Promise<Provider> {
    if (assistant.model?.provider) {
      const provider = await this.getProvider(assistant.model.provider)
      if (provider) {
        return provider
      }
    }

    // Fallback to default provider
    return this.getDefaultProvider()
  }

  /**
   * Refresh all providers cache from database
   */
  public async refreshAllProvidersCache(): Promise<Provider[]> {
    logger.info('Manually refreshing all providers cache')
    return await this.getAllProviders(true)
  }

  /**
   * Invalidate all providers cache
   */
  public invalidateCache(): void {
    // Clear default provider cache so it reloads on next access
    if (this.defaultProviderCache) {
      this.defaultProviderCache = null
      logger.verbose('Default provider cache cleared during invalidation')
      this.notifyDefaultProviderSubscribers()
    }

    // Clear LRU cache and access order
    if (this.providerCache.size > 0) {
      this.providerCache.clear()
      this.accessOrder = []
      logger.verbose('LRU provider cache cleared during invalidation')
    }

    this.allProvidersCache.clear()
    this.allProvidersCacheTimestamp = null
    logger.info('All providers cache invalidated')
    this.notifyAllProvidersSubscribers()
  }

  // ==================== Public API: Subscription ====================

  /**
   * Subscribe to changes for a specific provider
   */
  public subscribeProvider(providerId: string, callback: () => void): UnsubscribeFunction {
    if (!this.providerSubscribers.has(providerId)) {
      this.providerSubscribers.set(providerId, new Set())
    }

    const subscribers = this.providerSubscribers.get(providerId)!
    subscribers.add(callback)

    logger.verbose(`Added subscriber for provider ${providerId}, total: ${subscribers.size}`)

    return () => {
      subscribers.delete(callback)

      if (subscribers.size === 0) {
        this.providerSubscribers.delete(providerId)
        logger.verbose(`Removed last subscriber for provider ${providerId}, cleaned up`)
      } else {
        logger.verbose(`Removed subscriber for provider ${providerId}, remaining: ${subscribers.size}`)
      }
    }
  }

  /**
   * Subscribe to all provider changes
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
   * Subscribe to all providers list changes
   */
  public subscribeAllProviders(callback: () => void): UnsubscribeFunction {
    this.allProvidersSubscribers.add(callback)
    logger.verbose(`Added all providers subscriber, total: ${this.allProvidersSubscribers.size}`)

    return () => {
      this.allProvidersSubscribers.delete(callback)
      logger.verbose(`Removed all providers subscriber, remaining: ${this.allProvidersSubscribers.size}`)
    }
  }

  /**
   * Clear cached providers and reset initialization state
   */
  public clearCache(): void {
    this.defaultProviderCache = null
    this.defaultProviderInitialized = false
    this.providerCache.clear()
    this.accessOrder = []
    this.loadPromises.clear()
    this.allProvidersCache.clear()
    this.allProvidersCacheTimestamp = null
    this.isLoadingAllProviders = false
    this.loadAllProvidersPromise = null

    logger.info('ProviderService caches cleared')
  }

  /**
   * Subscribe to default provider changes
   */
  public subscribeDefaultProvider(callback: () => void): UnsubscribeFunction {
    this.defaultProviderSubscribers.add(callback)
    logger.verbose(`Added default provider subscriber, total: ${this.defaultProviderSubscribers.size}`)

    return () => {
      this.defaultProviderSubscribers.delete(callback)
      logger.verbose(`Removed default provider subscriber, remaining: ${this.defaultProviderSubscribers.size}`)
    }
  }

  // ==================== Public API: Debugging ====================

  /**
   * Get cache status for debugging
   */
  public getCacheStatus(): ProviderCacheStatus {
    const cacheAge = this.allProvidersCacheTimestamp !== null ? Date.now() - this.allProvidersCacheTimestamp : null

    return {
      defaultProvider: {
        cached: this.defaultProviderCache !== null,
        providerId: this.defaultProviderCache?.id ?? null
      },
      lruCache: {
        size: this.providerCache.size,
        maxSize: this.MAX_CACHE_SIZE,
        providerIds: Array.from(this.providerCache.keys()),
        accessOrder: [...this.accessOrder]
      },
      allProvidersCache: {
        size: this.allProvidersCache.size,
        isValid:
          this.allProvidersCacheTimestamp !== null && Date.now() - this.allProvidersCacheTimestamp < this.CACHE_TTL,
        age: cacheAge
      },
      subscribers: {
        providerSubscribers: this.providerSubscribers.size,
        allProvidersSubscribers: this.allProvidersSubscribers.size,
        globalSubscribers: this.globalSubscribers.size
      }
    }
  }

  /**
   * Log cache status (formatted)
   */
  public logCacheStatus(): void {
    const status = this.getCacheStatus()

    console.log('==================== ProviderService Cache Status ====================')
    console.log('Default Provider:')
    console.log(`  - Cached: ${status.defaultProvider.cached}`)
    console.log(`  - Provider ID: ${status.defaultProvider.providerId}`)
    console.log('')
    console.log('LRU Cache:')
    console.log(`  - Size: ${status.lruCache.size}/${status.lruCache.maxSize}`)
    console.log(`  - Cached Providers: [${status.lruCache.providerIds.join(', ')}]`)
    console.log(`  - Access Order (oldest→newest): [${status.lruCache.accessOrder.join(', ')}]`)
    console.log('')
    console.log('All Providers Cache:')
    console.log(`  - Size: ${status.allProvidersCache.size}`)
    console.log(`  - Valid: ${status.allProvidersCache.isValid}`)
    console.log(
      `  - Age: ${status.allProvidersCache.age !== null ? Math.floor(status.allProvidersCache.age / 1000) + 's' : 'N/A'}`
    )
    console.log('')
    console.log('Subscribers:')
    console.log(`  - Provider Subscribers: ${status.subscribers.providerSubscribers}`)
    console.log(`  - All Providers Subscribers: ${status.subscribers.allProvidersSubscribers}`)
    console.log(`  - Global Subscribers: ${status.subscribers.globalSubscribers}`)
    console.log('================================================================')
  }

  // ==================== Private Methods: Database Operations ====================

  /**
   * Load provider from database and add to cache
   */
  private async loadProviderFromDatabase(providerId: string): Promise<Provider | null> {
    try {
      const provider = await providerDatabase.getProviderById(providerId)

      if (provider) {
        // Check if this is the default provider
        const defaultModel = getDefaultModel()
        if (provider.id === defaultModel.provider) {
          this.defaultProviderCache = provider
          logger.debug(`Loaded default provider and cached: ${providerId}`)
        } else {
          this.addToCache(providerId, provider)
          logger.debug(`Loaded provider from database and cached: ${providerId}`)
        }
        return provider
      } else {
        logger.warn(`Provider ${providerId} not found in database`)
        return null
      }
    } catch (error) {
      logger.error(`Failed to load provider ${providerId} from database:`, error as Error)
      return null
    }
  }

  /**
   * Load all providers from database and update cache
   */
  private async loadAllProvidersFromDatabase(): Promise<Provider[]> {
    if (this.isLoadingAllProviders && this.loadAllProvidersPromise) {
      logger.verbose('Waiting for ongoing loadAllProviders operation')
      return await this.loadAllProvidersPromise
    }

    this.isLoadingAllProviders = true
    this.loadAllProvidersPromise = (async () => {
      try {
        logger.info('Loading all providers from database')
        const providers = await providerDatabase.getAllProviders()

        // Update cache
        this.allProvidersCache.clear()
        providers.forEach(provider => {
          this.allProvidersCache.set(provider.id, provider)
        })

        // Update timestamp
        this.allProvidersCacheTimestamp = Date.now()

        logger.info(`Loaded ${providers.length} providers into cache`)

        // Notify subscribers
        this.notifyAllProvidersSubscribers()

        return providers
      } catch (error) {
        logger.error('Failed to load all providers from database:', error as Error)
        throw error
      } finally {
        this.isLoadingAllProviders = false
        this.loadAllProvidersPromise = null
      }
    })()

    return await this.loadAllProvidersPromise
  }

  /**
   * Perform provider creation with error handling
   */
  private async performProviderCreate(provider: Provider): Promise<void> {
    try {
      await providerDatabase.upsertProviders([provider])
      logger.debug(`Provider created successfully: ${provider.id}`)

      // Update cache if it exists
      if (this.allProvidersCache.size > 0 || this.allProvidersCacheTimestamp !== null) {
        this.allProvidersCache.set(provider.id, provider)
        logger.verbose(`Added new provider to cache: ${provider.id}`)
      }

      // Notify subscribers
      this.notifyProviderSubscribers(provider.id)
      this.notifyGlobalSubscribers()
      this.notifyAllProvidersSubscribers()
    } catch (error) {
      logger.error(`Failed to create provider ${provider.id}:`, error as Error)
      throw error
    }
  }

  /**
   * Perform optimistic provider update with rollback on failure
   */
  private async performProviderUpdate(providerId: string, updates: Partial<Omit<Provider, 'id'>>): Promise<void> {
    // Save old data for rollback
    const oldDefaultProvider = this.defaultProviderCache?.id === providerId ? { ...this.defaultProviderCache } : null
    const oldLRUProvider = this.providerCache.get(providerId) ? { ...this.providerCache.get(providerId)! } : null
    const oldAllProvider = this.allProvidersCache.get(providerId)
      ? { ...this.allProvidersCache.get(providerId)! }
      : null

    try {
      // Fetch current provider data
      let currentProviderData: Provider

      if (this.defaultProviderCache?.id === providerId) {
        currentProviderData = this.defaultProviderCache
      } else if (this.providerCache.has(providerId)) {
        currentProviderData = this.providerCache.get(providerId)!
      } else if (this.allProvidersCache.has(providerId)) {
        currentProviderData = this.allProvidersCache.get(providerId)!
      } else {
        const provider = await providerDatabase.getProviderById(providerId)
        if (!provider) {
          throw new Error(`Provider with ID ${providerId} not found`)
        }
        currentProviderData = provider
      }

      // Prepare updated provider
      const updatedProvider: Provider = {
        ...currentProviderData,
        ...updates,
        id: providerId
      }

      // Optimistic update: update all caches
      this.updateProviderInCache(providerId, updatedProvider)

      // Notify subscribers (UI updates immediately)
      this.notifyProviderSubscribers(providerId)

      // If this is the default provider, notify default subscribers
      if (this.defaultProviderCache?.id === providerId) {
        this.notifyDefaultProviderSubscribers()
      }

      // Persist to database
      await providerDatabase.upsertProviders([updatedProvider])

      // Notify other subscribers
      this.notifyGlobalSubscribers()
      this.notifyAllProvidersSubscribers()

      logger.debug(`Provider updated successfully: ${providerId}`)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to update provider, rolling back:', error as Error)

      if (oldDefaultProvider) {
        this.defaultProviderCache = oldDefaultProvider
      }

      if (oldLRUProvider) {
        this.providerCache.set(providerId, oldLRUProvider)
      } else {
        this.providerCache.delete(providerId)
      }

      if (oldAllProvider) {
        this.allProvidersCache.set(providerId, oldAllProvider)
      } else {
        this.allProvidersCache.delete(providerId)
      }

      this.notifyProviderSubscribers(providerId)
      if (this.defaultProviderCache?.id === providerId) {
        this.notifyDefaultProviderSubscribers()
      }

      throw error
    }
  }

  // ==================== Private Methods: Notification ====================

  private notifyProviderSubscribers(providerId: string): void {
    const subscribers = this.providerSubscribers.get(providerId)
    if (subscribers && subscribers.size > 0) {
      logger.verbose(`Notifying ${subscribers.size} subscribers for provider ${providerId}`)
      subscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error(`Error in provider ${providerId} subscriber callback:`, error as Error)
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

  private notifyAllProvidersSubscribers(): void {
    if (this.allProvidersSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.allProvidersSubscribers.size} all providers subscribers`)
      this.allProvidersSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in all providers subscriber callback:', error as Error)
        }
      })
    }
  }

  private notifyDefaultProviderSubscribers(): void {
    if (this.defaultProviderSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.defaultProviderSubscribers.size} default provider subscribers`)
      this.defaultProviderSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in default provider subscriber callback:', error as Error)
        }
      })
    }
  }

  // ==================== Private Methods: LRU Cache Management ====================

  private addToCache(providerId: string, provider: Provider): void {
    // Don't cache default provider in LRU (it has its own permanent cache)
    const defaultModel = getDefaultModel()
    if (provider.id === defaultModel.provider) {
      logger.verbose(`Skipping LRU cache for default provider: ${providerId}`)
      return
    }

    // If cache is full and provider is not already cached, evict oldest
    if (!this.providerCache.has(providerId) && this.providerCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestFromCache()
    }

    // Add or update in cache
    this.providerCache.set(providerId, provider)

    // Update access order
    this.updateAccessOrder(providerId)

    logger.verbose(`Added provider to LRU cache: ${providerId} (cache size: ${this.providerCache.size})`)
  }

  private updateAccessOrder(providerId: string): void {
    const index = this.accessOrder.indexOf(providerId)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(providerId)
  }

  private evictOldestFromCache(): void {
    if (this.accessOrder.length === 0) {
      logger.warn('Attempted to evict from empty LRU cache')
      return
    }

    const oldestProviderId = this.accessOrder.shift()!
    this.providerCache.delete(oldestProviderId)

    logger.debug(`Evicted oldest provider from LRU cache: ${oldestProviderId}`)
  }

  private updateProviderInCache(providerId: string, updatedProvider: Provider): void {
    // Update default provider cache
    if (this.defaultProviderCache?.id === providerId) {
      this.defaultProviderCache = updatedProvider
      logger.verbose(`Updated default provider cache: ${providerId}`)
    }

    // Update LRU cache
    if (this.providerCache.has(providerId)) {
      this.providerCache.set(providerId, updatedProvider)
      this.updateAccessOrder(providerId)
      logger.verbose(`Updated LRU cache for provider: ${providerId}`)
    }

    // Update all providers cache
    if (this.allProvidersCache.has(providerId)) {
      this.allProvidersCache.set(providerId, updatedProvider)
      logger.verbose(`Updated all providers cache for provider: ${providerId}`)
    }
  }

  private removeProviderFromCache(providerId: string): void {
    // Remove from default provider cache
    if (this.defaultProviderCache?.id === providerId) {
      this.defaultProviderCache = null
      logger.verbose(`Removed default provider cache: ${providerId}`)
    }

    // Remove from LRU cache
    if (this.providerCache.has(providerId)) {
      this.providerCache.delete(providerId)
      const index = this.accessOrder.indexOf(providerId)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      logger.verbose(`Removed from LRU cache: ${providerId}`)
    }

    // Remove from all providers cache
    if (this.allProvidersCache.has(providerId)) {
      this.allProvidersCache.delete(providerId)
      logger.verbose(`Removed from all providers cache: ${providerId}`)
    }
  }
}

// ==================== Exported Singleton Instance ====================

export const providerService = ProviderService.getInstance()

// ==================== Backward Compatible Functions ====================

/**
 * Save a provider (backward compatible)
 * @deprecated Use providerService.updateProvider() instead
 */
export async function saveProvider(provider: Provider): Promise<void> {
  await providerService.updateProvider(provider.id, provider)
}

/**
 * Get provider by ID (backward compatible)
 * @deprecated Use providerService.getProvider() instead
 */
export async function getProviderById(providerId: string): Promise<Provider> {
  const provider = await providerService.getProvider(providerId)
  if (!provider) {
    throw new Error(`Provider with ID ${providerId} not found`)
  }
  return provider
}

/**
 * Get all providers (backward compatible)
 * @deprecated Use providerService.getAllProviders() instead
 */
export async function getAllProviders(): Promise<Provider[]> {
  return await providerService.getAllProviders()
}

/**
 * Get provider by model (backward compatible)
 * This is the most frequently called function
 */
export function getProviderByModel(model: Model): Provider {
  return providerService.getProviderByModel(model)
}

/**
 * Get default provider (backward compatible)
 */
export function getDefaultProvider(): Provider {
  return providerService.getDefaultProvider()
}

/**
 * Get assistant provider (backward compatible)
 */
export async function getAssistantProvider(assistant: Assistant): Promise<Provider> {
  return await providerService.getAssistantProvider(assistant)
}

/**
 * Delete provider (backward compatible)
 * @deprecated Use providerService.deleteProvider() instead
 */
export async function deleteProvider(providerId: string): Promise<void> {
  await providerService.deleteProvider(providerId)
}

/**
 * Get provider by ID synchronously (backward compatible)
 */
export function getProviderByIdSync(providerId: string): Provider {
  const provider = providerService.getProviderCached(providerId)
  if (!provider) {
    throw new Error(`Provider with ID ${providerId} not found`)
  }
  return provider
}
