/**
 * @fileoverview CacheService - Infrastructure component for in-memory caching
 *
 * NAMING NOTE:
 * This component is named "CacheService" for management consistency, but it is
 * actually an infrastructure component (cache manager) rather than a business service.
 *
 * True Nature: Cache Manager / Infrastructure Utility
 * - Provides low-level caching primitives (get/set/has/delete)
 * - Manages TTL, expiration, and garbage collection
 * - Contains zero business logic - purely technical functionality
 * - Acts as a utility for other services (StreamingService, PreferenceService, etc.)
 *
 * The "Service" suffix is kept for consistency with existing codebase conventions,
 * but developers should understand this is infrastructure, not business logic.
 */

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('CacheService')

/**
 * Internal cache entry structure
 */
interface CacheEntry<T = unknown> {
  value: T
  expireAt?: number
}

class CacheService {
  private static instance: CacheService
  private initialized = false

  // Internal cache storage
  private cache = new Map<string, CacheEntry>()

  // GC timer and interval
  private gcInterval: ReturnType<typeof setInterval> | null = null
  private readonly GC_INTERVAL_MS = 60 * 1000 // 1 minute

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService()
    }
    return CacheService.instance
  }

  /**
   * Initialize the cache service
   * Starts garbage collection timer
   */
  public initialize(): void {
    if (this.initialized) {
      logger.warn('CacheService already initialized')
      return
    }

    this.startGarbageCollection()
    this.initialized = true
    logger.info('CacheService initialized')
  }

  // ============ Core Cache Operations ============

  /**
   * Get value from cache
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Lazy TTL check
    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.cache.delete(key)
      logger.debug(`Entry expired on access: ${key}`)
      return undefined
    }

    return entry.value as T
  }

  /**
   * Set value in cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds (optional, no expiration if omitted)
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      value,
      expireAt: ttl ? Date.now() + ttl : undefined
    }

    this.cache.set(key, entry)
  }

  /**
   * Check if key exists in cache (and is not expired)
   *
   * @param key - Cache key
   * @returns True if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // Lazy TTL check
    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Delete from cache
   *
   * @param key - Cache key
   * @returns True if the entry existed and was deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    logger.debug('Cache cleared')
  }

  /**
   * Get cache size (number of entries, including potentially expired ones)
   */
  get size(): number {
    return this.cache.size
  }

  // ============ Bulk Operations ============

  /**
   * Get multiple values by keys
   *
   * @param keys - Array of cache keys
   * @returns Object mapping keys to values (only existing/non-expired entries)
   */
  getMany<T>(keys: string[]): Record<string, T> {
    const result: Record<string, T> = {}
    for (const key of keys) {
      const value = this.get<T>(key)
      if (value !== undefined) {
        result[key] = value
      }
    }
    return result
  }

  /**
   * Set multiple values at once
   *
   * @param entries - Object mapping keys to values
   * @param ttl - Optional TTL for all entries
   */
  setMany<T>(entries: Record<string, T>, ttl?: number): void {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value, ttl)
    }
  }

  /**
   * Delete multiple keys at once
   *
   * @param keys - Array of keys to delete
   * @returns Number of entries actually deleted
   */
  deleteMany(keys: string[]): number {
    let deleted = 0
    for (const key of keys) {
      if (this.cache.delete(key)) {
        deleted++
      }
    }
    return deleted
  }

  /**
   * Get all keys matching a prefix
   *
   * @param prefix - Key prefix to match
   * @returns Array of matching keys
   */
  getKeysByPrefix(prefix: string): string[] {
    const keys: string[] = []
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }

  /**
   * Delete all keys matching a prefix
   *
   * @param prefix - Key prefix to match
   * @returns Number of entries deleted
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        if (this.cache.delete(key)) {
          deleted++
        }
      }
    }
    return deleted
  }

  // ============ Garbage Collection ============

  /**
   * Start periodic garbage collection
   */
  private startGarbageCollection(): void {
    if (this.gcInterval) return

    this.gcInterval = setInterval(() => {
      this.runGarbageCollection()
    }, this.GC_INTERVAL_MS)

    logger.debug('Garbage collection started')
  }

  /**
   * Run garbage collection to remove expired entries
   */
  private runGarbageCollection(): void {
    const now = Date.now()
    let removedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expireAt && now > entry.expireAt) {
        this.cache.delete(key)
        removedCount++
      }
    }

    if (removedCount > 0) {
      logger.debug(`Garbage collection removed ${removedCount} expired entries`)
    }
  }

  /**
   * Stop garbage collection and cleanup all resources
   */
  public cleanup(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval)
      this.gcInterval = null
    }

    this.cache.clear()
    this.initialized = false
    logger.debug('CacheService cleanup completed')
  }

  // ============ Utility Methods ============

  /**
   * Get cache stats for debugging
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  /**
   * Get remaining TTL for a key
   *
   * @param key - Cache key
   * @returns Remaining TTL in milliseconds, or undefined if no TTL or key doesn't exist
   */
  getRemainingTTL(key: string): number | undefined {
    const entry = this.cache.get(key)
    if (!entry || !entry.expireAt) return undefined

    const remaining = entry.expireAt - Date.now()
    return remaining > 0 ? remaining : 0
  }

  /**
   * Update TTL for an existing key
   *
   * @param key - Cache key
   * @param ttl - New TTL in milliseconds
   * @returns True if TTL was updated, false if key doesn't exist
   */
  updateTTL(key: string, ttl: number): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    entry.expireAt = Date.now() + ttl
    return true
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance()

// Export class for testing
export { CacheService }
