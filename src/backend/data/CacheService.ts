/**
 * Backend cache corresponding to Cherry Desktop's Main CacheService.
 *
 * Mobile keeps the Main-owned memory and persist tiers. Electron-only shared
 * cache relay, BrowserWindow synchronization, and IPC handlers are omitted
 * because frontend and backend execute in one Hermes runtime.
 */

import { loggerService } from '@logger';
import { createMMKV } from 'react-native-mmkv';

import { BaseService, Injectable } from '@/backend/core/lifecycle';
import {
  type BackendCacheKey,
  type BackendPersistCacheKey,
  type BackendPersistCacheSchema,
  DefaultBackendPersistCache,
  type InferBackendCacheValue,
} from '@/shared/data/cache/cacheSchemas';
import type { CacheEntry } from '@/shared/data/cache/cacheTypes';
import { deepEqual } from '@/shared/utils/deepEqual';

const logger = loggerService.withContext('BackendCacheService');

interface BackendCacheStorage {
  delete(key: string): void;
  getAllKeys(): string[];
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

function createBackendCacheStorage(): BackendCacheStorage {
  const mmkv = createMMKV({ id: 'cherry-backend-cache-persist' });
  return {
    delete: (key) => {
      mmkv.remove(key);
    },
    getAllKeys: () => mmkv.getAllKeys(),
    getString: (key) => mmkv.getString(key),
    set: (key, value) => mmkv.set(key, value),
  };
}

/** Map-backed storage for isolated backend CacheService tests. */
export function createInMemoryBackendCacheStorage(): BackendCacheStorage {
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

type MemorySubscriber<K extends BackendCacheKey> = (
  newValue: InferBackendCacheValue<K> | undefined,
  oldValue: InferBackendCacheValue<K> | undefined,
) => void;

type PersistSubscriber<K extends BackendPersistCacheKey> = (
  newValue: BackendPersistCacheSchema[K],
  oldValue: BackendPersistCacheSchema[K],
) => void;

type Subscriber = (newValue: unknown, oldValue: unknown) => void;

@Injectable('CacheService')
export class CacheService extends BaseService {
  private readonly memory = new Map<string, CacheEntry>();
  private readonly persist = new Map<BackendPersistCacheKey, unknown>();
  private readonly memorySubscribers = new Map<string, Set<Subscriber>>();
  private readonly persistSubscribers = new Map<string, Set<Subscriber>>();
  private initialized = false;
  private disposed = false;

  /**
   * The default storage is resolved here rather than injected because MMKV is
   * process-wide: a second instance would read the same file, so there is
   * nothing for the container to own. Tests pass an in-memory storage directly.
   */
  constructor(private readonly storage: BackendCacheStorage = createBackendCacheStorage()) {
    super();
  }

  protected onInit(): void {
    if (this.initialized) {
      return;
    }
    if (this.disposed) {
      throw new Error('CacheService has been disposed');
    }

    this.loadPersist();
    this.initialized = true;
  }

  /**
   * Every other service reads the cache, so this must not run until they have
   * all stopped — which reverse-order teardown guarantees, since everything that
   * uses the cache depends on it.
   */
  protected onStop(): void {
    if (this.disposed) {
      return;
    }

    this.memory.clear();
    this.persist.clear();
    this.memorySubscribers.clear();
    this.persistSubscribers.clear();
    this.initialized = false;
    this.disposed = true;
  }

  get<K extends BackendCacheKey>(key: K): InferBackendCacheValue<K> | undefined {
    this.assertReady();
    const entry = this.memory.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expireAt !== undefined && Date.now() > entry.expireAt) {
      this.memory.delete(key);
      return undefined;
    }
    return entry.value as InferBackendCacheValue<K>;
  }

  set<K extends BackendCacheKey>(key: K, value: InferBackendCacheValue<K>, ttl?: number): void {
    this.assertReady();
    const oldValue = this.get(key);
    this.memory.set(key, {
      expireAt: ttl ? Date.now() + ttl : undefined,
      value,
    });

    if (!deepEqual(oldValue, value)) {
      this.notify(this.memorySubscribers, key, value, oldValue);
    }
  }

  has<K extends BackendCacheKey>(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete<K extends BackendCacheKey>(key: K): boolean {
    this.assertReady();
    const oldValue = this.get(key);
    const removed = this.memory.delete(key);
    if (oldValue !== undefined) {
      this.notify(this.memorySubscribers, key, undefined, oldValue);
    }
    return removed;
  }

  subscribeChange<K extends BackendCacheKey>(key: K, callback: MemorySubscriber<K>): () => void {
    this.assertReady();
    return this.subscribe(this.memorySubscribers, key, callback as Subscriber);
  }

  getPersist<K extends BackendPersistCacheKey>(key: K): BackendPersistCacheSchema[K] {
    this.assertReady();
    const value = this.persist.get(key);
    return (
      value !== undefined ? value : DefaultBackendPersistCache[key]
    ) as BackendPersistCacheSchema[K];
  }

  setPersist<K extends BackendPersistCacheKey>(key: K, value: BackendPersistCacheSchema[K]): void {
    this.assertReady();
    const oldValue = this.getPersist(key);
    const changed = !deepEqual(oldValue, value);
    const isDefault = deepEqual(value, DefaultBackendPersistCache[key]);

    if (changed) {
      if (isDefault) {
        this.persist.delete(key);
      } else {
        this.persist.set(key, value);
      }
      this.notify(this.persistSubscribers, key, value, oldValue);
    }

    try {
      if (isDefault) {
        this.storage.delete(key);
      } else {
        this.storage.set(key, JSON.stringify(value));
      }
    } catch (error) {
      logger.error(`Failed to persist backend cache key "${key}"`, error as Error);
    }
  }

  hasPersist<K extends BackendPersistCacheKey>(key: K): boolean {
    return !deepEqual(this.getPersist(key), DefaultBackendPersistCache[key]);
  }

  deletePersist<K extends BackendPersistCacheKey>(key: K): void {
    this.setPersist(key, DefaultBackendPersistCache[key]);
  }

  subscribePersistChange<K extends BackendPersistCacheKey>(
    key: K,
    callback: PersistSubscriber<K>,
  ): () => void {
    this.assertReady();
    return this.subscribe(this.persistSubscribers, key, callback as Subscriber);
  }

  private subscribe(
    subscriptions: Map<string, Set<Subscriber>>,
    key: string,
    callback: Subscriber,
  ): () => void {
    let callbacks = subscriptions.get(key);
    if (!callbacks) {
      callbacks = new Set();
      subscriptions.set(key, callbacks);
    }
    callbacks.add(callback);

    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        subscriptions.delete(key);
      }
    };
  }

  private notify(
    subscriptions: Map<string, Set<Subscriber>>,
    key: string,
    newValue: unknown,
    oldValue: unknown,
  ): void {
    const callbacks = subscriptions.get(key);
    if (!callbacks) {
      return;
    }

    for (const callback of [...callbacks]) {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        logger.error(`Backend cache subscriber failed for "${key}"`, error as Error);
      }
    }
  }

  private loadPersist(): void {
    this.persist.clear();
    const schemaKeys = Object.keys(DefaultBackendPersistCache) as BackendPersistCacheKey[];

    for (const key of schemaKeys) {
      let stored: string | undefined;
      try {
        stored = this.storage.getString(key);
      } catch (error) {
        logger.error(`Failed to read backend cache key "${key}"`, error as Error);
        continue;
      }

      if (stored === undefined) {
        continue;
      }

      try {
        const value = JSON.parse(stored) as BackendPersistCacheSchema[typeof key];
        if (deepEqual(value, DefaultBackendPersistCache[key])) {
          this.storage.delete(key);
        } else {
          this.persist.set(key, value);
        }
      } catch (error) {
        logger.error(`Dropping corrupted backend cache entry "${key}"`, error as Error);
        this.storage.delete(key);
      }
    }

    try {
      for (const storedKey of this.storage.getAllKeys()) {
        if (!(storedKey in DefaultBackendPersistCache)) {
          this.storage.delete(storedKey);
        }
      }
    } catch (error) {
      logger.error('Failed to prune backend cache keys', error as Error);
    }
  }

  private assertReady(): void {
    if (!this.initialized || this.disposed) {
      throw new Error('CacheService is not initialized');
    }
  }
}
