/**
 * PreferenceService - Unified preference and app state management service
 *
 * Design Principles:
 * 1. Singleton Pattern - Global unique instance with shared cache
 * 2. Lazy Loading - Load on demand to avoid blocking app startup
 * 3. Type Safety - Full generic support with automatic type inference
 * 4. Observer Pattern - Integrated with React's useSyncExternalStore
 * 5. Optimistic Updates - Immediate UI response with background persistence
 *
 * Architecture (React Native - Single Process):
 * ```
 * React Components
 *   ↓ usePreference('ui.theme_mode')
 * React Hooks (useSyncExternalStore)
 *   ↓ subscribe / getSnapshot
 * PreferenceService (This File)
 *   • Memory Cache (Map<key, value>)
 *   • Subscription Management (Map<key, Set<callback>>)
 *   • Request Queue (Concurrency Control)
 *   • Error Handling + Logging
 *   ↓
 * Drizzle ORM → SQLite
 * ```
 *
 * @example Basic Usage
 * ```typescript
 * // Get preference value
 * const theme = await preferenceService.get('ui.theme_mode')
 *
 * // Update preference value
 * await preferenceService.set('ui.theme_mode', 'dark')
 *
 * // Subscribe to changes
 * const unsubscribe = preferenceService.subscribe('ui.theme_mode', () => {
 *   console.log('Theme changed!')
 * })
 * ```
 */

import { db } from '@db/index'
import { preferenceTable } from '@db/schema'
import { eq } from 'drizzle-orm'

import { loggerService } from '@/services/LoggerService'
import { DefaultPreferences } from '@/shared/data/preference/preferenceSchemas'
import type { PreferenceDefaultScopeType, PreferenceKeyType } from '@/shared/data/preference/preferenceTypes'

const logger = loggerService.withContext('PreferenceService')

/**
 * Type helper to extract value type for a given preference key
 */
type PreferenceValue<K extends PreferenceKeyType> = PreferenceDefaultScopeType[K]

/**
 * Unsubscribe function returned by subscribe methods
 */
type UnsubscribeFunction = () => void

/**
 * PreferenceService - Singleton service for managing preferences and app state
 */
export class PreferenceService {
  // ==================== Singleton ====================
  private static instance: PreferenceService

  private constructor() {
    logger.debug('PreferenceService instance created')
  }

  /**
   * Get the singleton instance of PreferenceService
   */
  public static getInstance(): PreferenceService {
    if (!PreferenceService.instance) {
      PreferenceService.instance = new PreferenceService()
    }
    return PreferenceService.instance
  }

  // ==================== Core Storage ====================

  /**
   * In-memory cache for loaded preferences
   * Key: PreferenceKeyType (e.g., 'user.name')
   * Value: Actual preference value
   */
  private cache = new Map<PreferenceKeyType, any>()

  /**
   * Track keys that are currently being loaded from database
   * Prevents duplicate concurrent loads of the same key
   */
  private loadingKeys = new Set<PreferenceKeyType>()

  /**
   * Promise resolvers for keys being loaded
   * Used to wait for ongoing loads to complete
   */
  private loadPromises = new Map<PreferenceKeyType, Promise<any>>()

  // ==================== Subscription System ====================

  /**
   * Subscribers for specific preference keys
   * Key: PreferenceKeyType
   * Value: Set of callback functions
   */
  private subscribers = new Map<PreferenceKeyType, Set<() => void>>()

  /**
   * Global subscribers that listen to all preference changes
   */
  private globalSubscribers = new Set<() => void>()

  // ==================== Concurrency Control ====================

  /**
   * Update queue to ensure sequential writes for each key
   * Prevents race conditions when the same key is updated multiple times rapidly
   *
   * Key: PreferenceKeyType
   * Value: Promise of the ongoing update operation
   */
  private updateQueue = new Map<PreferenceKeyType, Promise<void>>()

  // ==================== Public API: Read Operations ====================

  /**
   * Get a preference value (async)
   *
   * This method implements lazy loading:
   * 1. Check cache → return immediately if cached
   * 2. Check if loading → wait for ongoing load
   * 3. Load from database → cache and return
   *
   * @param key - The preference key to retrieve
   * @returns Promise resolving to the preference value with default fallback
   *
   * @example
   * ```typescript
   * const theme = await preferenceService.get('ui.theme_mode')
   * // theme: ThemeMode (automatically inferred)
   * ```
   */
  public async get<K extends PreferenceKeyType>(key: K): Promise<PreferenceValue<K>> {
    // 1. Cache hit → return immediately
    if (this.cache.has(key)) {
      logger.verbose(`Cache hit for preference: ${key}`)
      return this.cache.get(key) as PreferenceValue<K>
    }

    // 2. Loading in progress → wait for completion
    if (this.loadingKeys.has(key)) {
      logger.verbose(`Waiting for ongoing load: ${key}`)
      return (await this.loadPromises.get(key)) as PreferenceValue<K>
    }

    // 3. First access → load from database
    logger.debug(`Loading preference from database: ${key}`)
    return await this.loadFromDatabase(key)
  }

  /**
   * Get cached preference value (sync)
   *
   * This method is used by React's useSyncExternalStore for fast synchronous access.
   * Returns undefined if the value hasn't been loaded yet.
   *
   * @param key - The preference key to retrieve
   * @returns The cached value, or undefined if not cached
   *
   * @example
   * ```typescript
   * const theme = preferenceService.getCached('ui.theme_mode')
   * // theme: ThemeMode | undefined
   * ```
   */
  public getCached<K extends PreferenceKeyType>(key: K): PreferenceValue<K> | undefined {
    return this.cache.get(key) as PreferenceValue<K> | undefined
  }

  /**
   * Get multiple preferences at once
   *
   * More efficient than calling get() multiple times individually.
   * Returns only the keys that are currently cached.
   *
   * @param keys - Array of preference keys to retrieve
   * @returns Partial object with preference values
   *
   * @example
   * ```typescript
   * const prefs = await preferenceService.getMultiple([
   *   'ui.theme_mode',
   *   'user.name'
   * ])
   * // prefs: { 'ui.theme_mode'?: ThemeMode, 'user.name'?: string }
   * ```
   */
  public async getMultiple<K extends PreferenceKeyType>(keys: K[]): Promise<Partial<PreferenceDefaultScopeType>> {
    const result: Partial<PreferenceDefaultScopeType> = {}

    // Separate cached and uncached keys
    const uncachedKeys: K[] = []

    for (const key of keys) {
      if (this.cache.has(key)) {
        result[key] = this.cache.get(key)
      } else {
        uncachedKeys.push(key)
      }
    }

    // Load uncached keys
    if (uncachedKeys.length > 0) {
      const loadPromises = uncachedKeys.map(key => this.get(key))
      const values = await Promise.all(loadPromises)

      uncachedKeys.forEach((key, index) => {
        result[key] = values[index] as any
      })
    }

    return result
  }

  // ==================== Public API: Write Operations ====================

  /**
   * Set a preference value with optimistic update
   *
   * Update flow:
   * 1. Update cache immediately (optimistic)
   * 2. Notify subscribers (UI updates)
   * 3. Write to database in background
   * 4. On failure: rollback cache and notify again
   *
   * Concurrency control:
   * - Uses request queue to ensure sequential writes per key
   * - Prevents race conditions from rapid updates
   *
   * @param key - The preference key to update
   * @param value - The new value to set
   * @throws Error if database write fails
   *
   * @example
   * ```typescript
   * await preferenceService.set('ui.theme_mode', 'dark')
   * // UI updates immediately, database saves in background
   * ```
   */
  public async set<K extends PreferenceKeyType>(key: K, value: PreferenceValue<K>): Promise<void> {
    // Wait for any ongoing update to the same key
    const previousUpdate = this.updateQueue.get(key)
    if (previousUpdate) {
      await previousUpdate
    }

    // Execute current update
    const currentUpdate = this.performUpdate(key, value)
    this.updateQueue.set(key, currentUpdate)

    try {
      await currentUpdate
    } finally {
      // Clean up queue (only if this is still the current update)
      if (this.updateQueue.get(key) === currentUpdate) {
        this.updateQueue.delete(key)
      }
    }
  }

  /**
   * Set multiple preferences at once
   *
   * More efficient than calling set() multiple times individually.
   * Updates are batched but still use optimistic updates per key.
   *
   * @param updates - Object with preference key-value pairs
   * @throws Error if any database write fails
   *
   * @example
   * ```typescript
   * await preferenceService.setMultiple({
   *   'ui.theme_mode': 'dark',
   *   'user.name': 'Alice'
   * })
   * ```
   */
  public async setMultiple(updates: Partial<PreferenceDefaultScopeType>): Promise<void> {
    const keys = Object.keys(updates) as PreferenceKeyType[]

    // Update all values sequentially
    // (Could be optimized with db.transaction for better performance)
    for (const key of keys) {
      const value = updates[key]
      if (value !== undefined) {
        await this.set(key, value as any)
      }
    }

    logger.debug(`Updated ${keys.length} preferences`)
  }

  // ==================== Public API: Utility Methods ====================

  /**
   * Reset a preference to its default value
   *
   * @param key - The preference key to reset
   */
  public async reset<K extends PreferenceKeyType>(key: K): Promise<void> {
    const defaultValue = DefaultPreferences.default[key]
    await this.set(key, defaultValue as PreferenceValue<K>)
    logger.info(`Reset preference ${key} to default value`)
  }

  /**
   * Reset all preferences to default values
   */
  public async resetAll(): Promise<void> {
    const keys = Object.keys(DefaultPreferences.default) as PreferenceKeyType[]
    await this.setMultiple(DefaultPreferences.default)
    logger.info(`Reset all ${keys.length} preferences to default values`)
  }

  /**
   * Clear the in-memory cache
   *
   * This is primarily for testing. In production, the cache should persist
   * for the lifetime of the app.
   */
  public clearCache(): void {
    this.cache.clear()
    this.loadingKeys.clear()
    this.loadPromises.clear()
    logger.debug('Preference cache cleared')
  }

  // ==================== Public API: Subscription ====================

  /**
   * Subscribe to changes for a specific preference key
   *
   * This method is designed to work with React's useSyncExternalStore.
   * The callback is invoked whenever the preference value changes.
   *
   * @param key - The preference key to watch
   * @param callback - Function to call when the preference changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = preferenceService.subscribe('ui.theme_mode', () => {
   *   console.log('Theme changed!')
   * })
   *
   * // Later: clean up subscription
   * unsubscribe()
   * ```
   */
  public subscribe<K extends PreferenceKeyType>(key: K, callback: () => void): UnsubscribeFunction {
    // Initialize subscriber set for this key if needed
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }

    const keySubscribers = this.subscribers.get(key)!
    keySubscribers.add(callback)

    logger.verbose(`Added subscriber for ${key}, total: ${keySubscribers.size}`)

    // Return unsubscribe function
    return () => {
      keySubscribers.delete(callback)

      // Clean up empty subscriber sets
      if (keySubscribers.size === 0) {
        this.subscribers.delete(key)
        logger.verbose(`Removed last subscriber for ${key}, cleaned up`)
      } else {
        logger.verbose(`Removed subscriber for ${key}, remaining: ${keySubscribers.size}`)
      }
    }
  }

  /**
   * Subscribe to all preference changes
   *
   * The callback is invoked whenever ANY preference value changes.
   * Useful for debugging or global state sync.
   *
   * @param callback - Function to call when any preference changes
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

  // ==================== Private Methods: Database Operations ====================

  /**
   * Load a preference from database
   *
   * Loads from the 'preference' table.
   * Falls back to default value if database query fails.
   *
   * @param key - The preference key to load
   * @returns The loaded value (or default if not found/error)
   */
  private async loadFromDatabase<K extends PreferenceKeyType>(key: K): Promise<PreferenceValue<K>> {
    this.loadingKeys.add(key)

    const loadPromise = (async () => {
      try {
        // Query database from preference table
        const result = await db.select().from(preferenceTable).where(eq(preferenceTable.key, key)).get()

        if (result) {
          const value = result.value as PreferenceValue<K>
          this.cache.set(key, value)
          logger.debug(`Loaded ${key} from database: ${JSON.stringify(value)}`)
          return value
        } else {
          // Not found in database → use default value
          const defaultValue = DefaultPreferences.default[key] as PreferenceValue<K>
          this.cache.set(key, defaultValue)
          logger.debug(`Preference ${key} not found in database, using default: ${JSON.stringify(defaultValue)}`)
          return defaultValue
        }
      } catch (error) {
        // Database error → use default value
        const defaultValue = DefaultPreferences.default[key] as PreferenceValue<K>
        logger.error(`Failed to load preference ${key}, using default:`, error as Error)
        this.cache.set(key, defaultValue)
        return defaultValue
      } finally {
        this.loadingKeys.delete(key)
        this.loadPromises.delete(key)
      }
    })()

    this.loadPromises.set(key, loadPromise)
    return await loadPromise
  }

  /**
   * Perform optimistic update with rollback on failure
   *
   * Update flow:
   * 1. Save old value for rollback
   * 2. Update cache immediately
   * 3. Notify subscribers (UI updates)
   * 4. Write to database
   * 5. On failure: rollback cache and notify again
   *
   * @param key - The preference key to update
   * @param newValue - The new value to set
   * @throws Error if database write fails (after rollback)
   */
  private async performUpdate<K extends PreferenceKeyType>(key: K, newValue: PreferenceValue<K>): Promise<void> {
    // 1. Save old value for potential rollback
    const oldValue = this.cache.get(key)

    // 2. Optimistic update: update cache immediately
    this.cache.set(key, newValue)

    // 3. Notify subscribers (UI updates immediately)
    this.notify(key)

    try {
      // 4. Persist to database in background
      await db
        .update(preferenceTable)
        .set({ value: newValue as any })
        .where(eq(preferenceTable.key, key))

      logger.debug(`Preference ${key} saved to database: ${JSON.stringify(newValue)}`)
    } catch (error) {
      // 5. Rollback on failure
      logger.error(`Failed to save preference ${key}, rolling back:`, error as Error)

      this.cache.set(key, oldValue)
      this.notify(key) // Notify again to revert UI

      throw new Error(`Failed to save preference ${key}: ${(error as Error).message}`)
    }
  }

  /**
   * Notify all subscribers of a preference change
   *
   * Invokes:
   * 1. Specific key subscribers
   * 2. Global subscribers
   *
   * @param key - The preference key that changed
   */
  private notify(key: PreferenceKeyType): void {
    // Notify key-specific subscribers
    const keySubscribers = this.subscribers.get(key)
    if (keySubscribers && keySubscribers.size > 0) {
      logger.verbose(`Notifying ${keySubscribers.size} subscribers for ${key}`)
      keySubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error(`Error in subscriber callback for ${key}:`, error as Error)
        }
      })
    }

    // Notify global subscribers
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

  // ==================== Debug Methods ====================

  /**
   * Get current cache size (for debugging)
   */
  public getCacheSize(): number {
    return this.cache.size
  }

  /**
   * Get subscriber count for a key (for debugging)
   */
  public getSubscriberCount(key: PreferenceKeyType): number {
    return this.subscribers.get(key)?.size || 0
  }

  /**
   * Get total subscriber count (for debugging)
   */
  public getTotalSubscriberCount(): number {
    let total = 0
    for (const subscribers of this.subscribers.values()) {
      total += subscribers.size
    }
    total += this.globalSubscribers.size
    return total
  }
}

// ==================== Exported Singleton Instance ====================

/**
 * Singleton instance of PreferenceService
 *
 * Use this instance throughout the application for preference management.
 *
 * @example
 * ```typescript
 * import { preferenceService } from '@/services/PreferenceService'
 *
 * const theme = await preferenceService.get('ui.theme_mode')
 * await preferenceService.set('ui.theme_mode', 'dark')
 * ```
 */
export const preferenceService = PreferenceService.getInstance()
