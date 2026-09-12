/**
 * @fileoverview CacheService - Infrastructure component for two-tier caching
 *
 * Ported from the desktop renderer `CacheService` (three tiers). Mobile runs a
 * single JS runtime with no multi-window IPC, so the desktop "shared" tier is
 * folded into the memory tier; when porting desktop call sites, mechanically
 * replace `getShared`/`setShared`/... with `get`/`set`/... and move the key
 * into `UseCacheSchema`.
 *
 * NAMING NOTE:
 * This component is named "CacheService" for management consistency, but it is
 * actually an infrastructure component (cache manager) rather than a business
 * service. It contains zero business logic.
 *
 * Ported API identifiers keep their desktop spelling verbatim (`hasTTL`,
 * `getCasual`, `DefaultUseCache`, ...) as a deliberate exception to the local
 * acronym/constant naming rules — same precedent as `DefaultPreferences` in
 * the preference domain — so desktop call sites and schema entries port
 * mechanically. Mobile-only additions (e.g. `KvStorage`) follow the local
 * rules.
 *
 * Tiers:
 * 1. Memory cache — cross-component, TTL-capable, lost on app restart
 * 2. Persist cache — survives restarts via a synchronous KV store (MMKV),
 *    default-relative semantics (getPersist never returns undefined)
 *
 * Features:
 * - All APIs are synchronous
 * - TTL lazy cleanup (checked on get/has, no timers)
 * - Hook reference tracking (prevents deletion of keys observed by mounted hooks)
 * - Type-safe schema keys with template-key support, plus a casual dynamic-key API
 *
 * The module-level singleton {@link cacheService} is the runtime instance —
 * hooks and services must share it. Tests construct their own
 * `new CacheService(createInMemoryKvStorage())` to avoid cross-test pollution.
 * Note the singleton survives bootstrap-provider remounts and React Fast Refresh of
 * consumer modules; the memory tier is session-scoped by design (cleared only
 * by a full JS reload, equivalent to a desktop window refresh).
 */

import { loggerService } from '@logger';
import { createMMKV } from 'react-native-mmkv';

import type {
  InferUseCacheValue,
  PersistCacheKey,
  PersistCacheSchema,
  UseCacheKey,
} from '@/shared/data/cache/cacheSchemas';
import { DefaultPersistCache } from '@/shared/data/cache/cacheSchemas';
import type {
  CacheEntry,
  CacheEntryDetail,
  CacheStats,
  CacheSubscriber,
  CacheTierSummary,
} from '@/shared/data/cache/cacheTypes';
import { deepEqual } from '@/shared/utils/deepEqual';

const logger = loggerService.withContext('CacheService');

interface KvStorage {
  delete(key: string): void;
  getAllKeys(): string[];
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

function createMmkvStorage(): KvStorage {
  const mmkv = createMMKV({ id: 'cherry-cache-persist' });
  return {
    delete: (key) => {
      mmkv.remove(key);
    },
    getAllKeys: () => mmkv.getAllKeys(),
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
  };
}

/** Map-backed storage for isolated CacheService tests. */
export function createInMemoryKvStorage(): KvStorage {
  const values = new Map<string, string>();
  return {
    delete: (key) => {
      values.delete(key);
    },
    getAllKeys: () => [...values.keys()],
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
  };
}

export class CacheService {
  // Two-tier cache system
  private memoryCache = new Map<string, CacheEntry>();
  private persistCache = new Map<PersistCacheKey, unknown>();

  // Hook reference tracking (reference-counted)
  private activeHookCounts = new Map<string, number>();

  // Subscription management
  private subscribers = new Map<string, Set<CacheSubscriber>>();

  // Persist tier backing store (one entry per schema key, JSON-encoded)
  private readonly storage: KvStorage;

  constructor(storage: KvStorage = createMmkvStorage()) {
    this.storage = storage;
    this.loadPersistCache();
  }

  // ============ Memory Cache ============

  /**
   * Get value from memory cache with TTL validation (type-safe)
   *
   * Supports both fixed keys and template keys following the schema.
   *
   * DESIGN NOTE: Returns `undefined` when cache miss or TTL expired.
   * This is intentional - developers need to know when a value doesn't exist
   * (e.g., after explicit deletion) and handle it appropriately.
   * For UI components that always need a value, use the `useCache` hook instead,
   * which provides automatic default value fallback.
   *
   * @param key - Schema-defined cache key (fixed or matching template pattern)
   * @returns Cached value or undefined if not found or expired
   */
  get<K extends UseCacheKey>(key: K): InferUseCacheValue<K> | undefined {
    return this.getInternal(key);
  }

  /**
   * Get value from memory cache with TTL validation (casual, dynamic key)
   *
   * Use this for fully dynamic keys that don't match any schema pattern.
   * For keys matching schema patterns (including templates), use `get()` instead.
   *
   * Note: Due to TypeScript limitations with template literal types, compile-time
   * blocking of schema keys works best with literal string arguments. Variable
   * keys are accepted but may not trigger compile errors.
   *
   * @template T - The expected value type (must be specified manually)
   * @param key - Dynamic cache key that doesn't match any schema pattern
   * @returns Cached value or undefined if not found or expired
   */
  getCasual<T>(key: Exclude<string, UseCacheKey>): T | undefined {
    return this.getInternal(key);
  }

  private getInternal(key: string): any {
    const entry = this.memoryCache.get(key);
    if (entry === undefined) {
      return undefined;
    }
    // Check TTL (lazy cleanup)
    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.memoryCache.delete(key);
      this.notifySubscribers(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set value in memory cache with optional TTL (type-safe)
   *
   * @param key - Schema-defined cache key (fixed or matching template pattern)
   * @param value - Value to cache (type inferred from schema via template matching)
   * @param ttl - Time to live in milliseconds (optional)
   */
  set<K extends UseCacheKey>(key: K, value: InferUseCacheValue<K>, ttl?: number): void {
    this.setInternal(key, value, ttl);
  }

  /**
   * Set value in memory cache with optional TTL (casual, dynamic key)
   *
   * Use this for fully dynamic keys that don't match any schema pattern.
   * For keys matching schema patterns (including templates), use `set()` instead.
   *
   * @param key - Dynamic cache key that doesn't match any schema pattern
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds (optional)
   */
  setCasual<T>(key: Exclude<string, UseCacheKey>, value: T, ttl?: number): void {
    this.setInternal(key, value, ttl);
  }

  private setInternal(key: string, value: any, ttl?: number): void {
    const existingEntry = this.memoryCache.get(key);

    // Value comparison optimization: deep-equal value is treated as unchanged
    // so object/array/Record values are short-circuited by content, not reference.
    if (existingEntry && deepEqual(existingEntry.value, value)) {
      // Value is same, only update TTL if needed
      const newExpireAt = ttl ? Date.now() + ttl : undefined;
      if (!Object.is(existingEntry.expireAt, newExpireAt)) {
        existingEntry.expireAt = newExpireAt;
      }
      return; // Skip notification
    }

    const entry: CacheEntry = {
      value,
      expireAt: ttl ? Date.now() + ttl : undefined,
    };

    this.memoryCache.set(key, entry);
    this.notifySubscribers(key);
  }

  /**
   * Check if key exists in memory cache and is not expired (type-safe)
   */
  has<K extends UseCacheKey>(key: K): boolean {
    return this.hasInternal(key);
  }

  /**
   * Check if key exists in memory cache and is not expired (casual, dynamic key)
   */
  hasCasual(key: Exclude<string, UseCacheKey>): boolean {
    return this.hasInternal(key);
  }

  private hasInternal(key: string): boolean {
    const entry = this.memoryCache.get(key);
    if (entry === undefined) {
      return false;
    }

    // Check TTL
    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.memoryCache.delete(key);
      this.notifySubscribers(key);
      return false;
    }

    return true;
  }

  /**
   * Delete from memory cache with hook protection (type-safe)
   * @returns True if deletion succeeded, false if key is protected by active hooks
   */
  delete<K extends UseCacheKey>(key: K): boolean {
    return this.deleteInternal(key);
  }

  /**
   * Delete from memory cache with hook protection (casual, dynamic key)
   * @returns True if deletion succeeded, false if key is protected by active hooks
   */
  deleteCasual(key: Exclude<string, UseCacheKey>): boolean {
    return this.deleteInternal(key);
  }

  private deleteInternal(key: string): boolean {
    // Check if key is being used by hooks
    if (this.activeHookCounts.get(key)) {
      logger.error(`Cannot delete key "${key}" as it's being used by useCache hook`);
      return false;
    }

    // Check if key exists before attempting deletion
    if (!this.memoryCache.has(key)) {
      return true;
    }

    this.memoryCache.delete(key);
    this.notifySubscribers(key);
    return true;
  }

  /**
   * Check if a key has TTL set in memory cache (type-safe)
   */
  hasTTL<K extends UseCacheKey>(key: K): boolean {
    const entry = this.memoryCache.get(key);
    return entry?.expireAt !== undefined;
  }

  /**
   * Check if a key has TTL set in memory cache (casual, dynamic key)
   */
  hasTTLCasual(key: Exclude<string, UseCacheKey>): boolean {
    const entry = this.memoryCache.get(key);
    return entry?.expireAt !== undefined;
  }

  // ============ Persist Cache (KV-store backed, default-relative) ============

  /**
   * Get value from persist cache with automatic default value fallback.
   * Never returns undefined: an unset key yields its schema default.
   */
  getPersist<K extends PersistCacheKey>(key: K): PersistCacheSchema[K] {
    const value = this.persistCache.get(key);
    return (value !== undefined ? value : DefaultPersistCache[key]) as PersistCacheSchema[K];
  }

  /**
   * Set value in persist cache with synchronous write-through to the KV store.
   *
   * No debounce: the MMKV-backed store makes single-key synchronous writes
   * cheap, and React Native has no reliable beforeunload to flush a dirty
   * buffer when the OS kills the app. A value deep-equal to the schema default
   * removes the stored entry instead (absent = default), keeping the store
   * minimal and making `deletePersist` a true removal.
   */
  setPersist<K extends PersistCacheKey>(key: K, value: PersistCacheSchema[K]): void {
    // Deep comparison gates only the memory update + notification. Storage
    // canonicalization below runs unconditionally so a previously failed MMKV
    // write — or a stale stored entry that now equals the schema default —
    // self-heals on the next setPersist instead of being blocked forever by
    // this short-circuit. The redundant single-key write is µs-level.
    if (!deepEqual(this.getPersist(key), value)) {
      this.persistCache.set(key, value);
      this.notifySubscribers(key);
    }

    try {
      if (deepEqual(value, DefaultPersistCache[key])) {
        this.storage.delete(key);
      } else {
        this.storage.set(key, JSON.stringify(value));
      }
    } catch (error) {
      logger.error(`Failed to persist cache key "${key}"`, error as Error);
    }
  }

  /**
   * Whether the key has been overridden — i.e. its effective value DIFFERS from
   * the schema default. This is intentionally NOT "is the key in the backing
   * store": a key whose stored value equals the default (or was never set)
   * reports false.
   */
  hasPersist<K extends PersistCacheKey>(key: K): boolean {
    return !deepEqual(this.getPersist(key), DefaultPersistCache[key]);
  }

  /**
   * Reset a persist key to its schema default ("delete" the override).
   *
   * This tier has no absent state — getPersist always returns the default once
   * the override is gone — so deletion is expressed as restoring the default.
   * Delegates to setPersist, inheriting its same-value no-op, subscriber
   * notify, and stored-entry removal.
   */
  deletePersist<K extends PersistCacheKey>(key: K): void {
    this.setPersist(key, DefaultPersistCache[key]);
  }

  // ============ Hook Reference Management ============

  /**
   * Register a hook as using a specific cache key to prevent deletion
   */
  registerHook(key: string): void {
    const currentCount = this.activeHookCounts.get(key) ?? 0;
    this.activeHookCounts.set(key, currentCount + 1);
  }

  /**
   * Unregister a hook from using a specific cache key
   */
  unregisterHook(key: string): void {
    const currentCount = this.activeHookCounts.get(key);
    if (!currentCount) {
      return;
    }

    if (currentCount === 1) {
      this.activeHookCounts.delete(key);
      return;
    }

    this.activeHookCounts.set(key, currentCount - 1);
  }

  // ============ Subscription Management ============

  /**
   * Subscribe to cache changes for a specific key
   * @returns Unsubscribe function
   */
  subscribe(key: string, callback: CacheSubscriber): () => void {
    let keySubscribers = this.subscribers.get(key);
    if (!keySubscribers) {
      keySubscribers = new Set();
      this.subscribers.set(key, keySubscribers);
    }
    keySubscribers.add(callback);

    return () => {
      keySubscribers.delete(callback);
      if (keySubscribers.size === 0) {
        this.subscribers.delete(key);
      }
    };
  }

  /**
   * Notify all subscribers when a cache key changes
   */
  private notifySubscribers(key: string): void {
    const keySubscribers = this.subscribers.get(key);
    if (keySubscribers) {
      keySubscribers.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          logger.error(`Subscriber callback error for key ${key}`, error as Error);
        }
      });
    }
  }

  // ============ Statistics ============

  /**
   * Get comprehensive statistics about all cache tiers
   *
   * @param includeDetails - Whether to include per-entry details (default: false)
   */
  getStats(includeDetails = false): CacheStats {
    const now = Date.now();

    const memory = this.processMemoryTier(now, includeDetails);
    const persist = this.processPersistTier(includeDetails);

    const totalBytes = memory.summary.estimatedBytes + persist.summary.estimatedBytes;

    const total = {
      totalCount: memory.summary.totalCount + persist.summary.totalCount,
      validCount: memory.summary.validCount + persist.summary.validCount,
      expiredCount: memory.summary.expiredCount,
      withTTLCount: memory.summary.withTTLCount,
      hookReferences: memory.summary.hookReferences + persist.summary.hookReferences,
      estimatedBytes: totalBytes,
      estimatedSize: formatBytes(totalBytes),
    };

    return {
      collectedAt: now,
      summary: {
        memory: memory.summary,
        persist: persist.summary,
        total,
      },
      details: {
        memory: memory.details,
        persist: persist.details,
      },
    };
  }

  private processMemoryTier(
    now: number,
    includeDetails: boolean,
  ): { summary: CacheTierSummary; details: CacheEntryDetail[] } {
    let validCount = 0;
    let expiredCount = 0;
    let withTTLCount = 0;
    let hookReferences = 0;
    let estimatedBytes = 0;
    const details: CacheEntryDetail[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      const expireAt = entry.expireAt;
      const hasTTL = expireAt !== undefined;
      const isExpired = expireAt !== undefined && now > expireAt;
      const hookCount = this.activeHookCounts.get(key) ?? 0;

      estimatedBytes += estimateSize(key) + estimateSize(entry.value);
      if (entry.expireAt) estimatedBytes += 8; // number size

      if (hasTTL) withTTLCount++;
      if (isExpired) {
        expiredCount++;
      } else {
        validCount++;
      }
      hookReferences += hookCount;

      if (includeDetails) {
        details.push({
          key,
          hasValue: entry.value !== undefined,
          hasTTL,
          isExpired,
          expireAt,
          remainingTTL: expireAt !== undefined && !isExpired ? expireAt - now : undefined,
          hookCount,
        });
      }
    }

    return {
      summary: {
        totalCount: this.memoryCache.size,
        validCount,
        expiredCount,
        withTTLCount,
        hookReferences,
        estimatedBytes,
      },
      details,
    };
  }

  /**
   * Persist cache has no TTL support, all entries are always valid
   */
  private processPersistTier(includeDetails: boolean): {
    summary: CacheTierSummary;
    details: CacheEntryDetail[];
  } {
    let hookReferences = 0;
    let estimatedBytes = 0;

    for (const [key, value] of this.persistCache.entries()) {
      hookReferences += this.activeHookCounts.get(key) ?? 0;
      estimatedBytes += estimateSize(key) + estimateSize(value);
    }

    const details: CacheEntryDetail[] = includeDetails
      ? Array.from(this.persistCache.keys()).map((key) => ({
          key,
          hasValue: true,
          hasTTL: false,
          isExpired: false,
          hookCount: this.activeHookCounts.get(key) ?? 0,
        }))
      : [];

    return {
      summary: {
        totalCount: this.persistCache.size,
        validCount: this.persistCache.size,
        expiredCount: 0,
        withTTLCount: 0,
        hookReferences,
        estimatedBytes,
      },
      details,
    };
  }

  // ============ Private Methods ============

  /**
   * Load persist cache from the KV store with default value initialization.
   *
   * Synchronous: defaults first, then per-key overrides from storage. A single
   * corrupted entry is dropped back to its default without affecting other
   * keys; keys no longer in the schema are pruned from storage.
   */
  private loadPersistCache(): void {
    for (const [key, defaultValue] of Object.entries(DefaultPersistCache)) {
      this.persistCache.set(key as PersistCacheKey, defaultValue);
    }

    const schemaKeys = Object.keys(DefaultPersistCache) as PersistCacheKey[];
    for (const key of schemaKeys) {
      let stored: string | undefined;
      try {
        stored = this.storage.getString(key);
      } catch (error) {
        logger.error(`Failed to read persist cache key "${key}"`, error as Error);
        continue;
      }
      if (stored === undefined) {
        continue;
      }

      try {
        this.persistCache.set(key, JSON.parse(stored));
      } catch (error) {
        logger.error(
          `Dropping corrupted persist cache entry "${key}", falling back to default`,
          error as Error,
        );
        this.storage.delete(key);
      }
    }

    // Prune storage entries whose keys left the schema
    try {
      for (const storedKey of this.storage.getAllKeys()) {
        if (!(storedKey in DefaultPersistCache)) {
          this.storage.delete(storedKey);
        }
      }
    } catch (error) {
      logger.error('Failed to prune orphan persist cache keys', error as Error);
    }
  }

  /**
   * Cleanup service resources (tests / hot-reload helper)
   */
  cleanup(): void {
    this.memoryCache.clear();
    this.persistCache.clear();
    this.activeHookCounts.clear();
    this.subscribers.clear();
  }
}

/**
 * Estimate memory size of a value in bytes using JSON serialization.
 * Rough estimate (UTF-16 code units ≈ bytes for ASCII-dominant JSON).
 */
function estimateSize(value: any): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

/**
 * Runtime singleton shared by hooks and services, persist tier backed by MMKV.
 * In tests, construct an isolated `new CacheService(createInMemoryKvStorage())`
 * instead (react-native-mmkv is also globally mocked in jest.setup.ts for
 * anything that touches this singleton transitively).
 */
export const cacheService = new CacheService();
