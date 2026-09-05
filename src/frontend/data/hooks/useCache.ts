import { loggerService } from '@logger';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { cacheService } from '@/frontend/data/CacheService';
import type {
  InferUseCacheValue,
  PersistCacheKey,
  PersistCacheSchema,
  UseCacheKey,
} from '@/shared/data/cache/cacheSchemas';
import { getUseCacheDefaultValue } from '@/shared/data/cache/templateKey';

const logger = loggerService.withContext('useCache');

// ============================================================================
// Functional Updater Types
// ============================================================================

/**
 * Shallow-readonly view of a cache value, used for the `prev` argument of a
 * functional updater. Containers (objects/arrays) become `Readonly<T>` so the
 * most common footgun — mutating `prev` in place and returning it — fails to
 * compile; primitives pass through unchanged so `prev => !prev` / `prev => prev + 1`
 * still work.
 *
 * Shallow only: nested mutation (e.g. `prev.items[0].x = ...`) is NOT caught by
 * the type — keep updaters pure (see {@link CacheSetStateAction}).
 */
type ReadonlyValue<T> = T extends object ? Readonly<T> : T;

/**
 * Setter input for cache hooks, mirroring React's `SetStateAction<T>`: either a
 * concrete value or an updater `(prev) => next`.
 *
 * The updater is resolved against the **latest stored value** at write time (not
 * the render-time snapshot), which is what makes read-modify-write safe across an
 * `await`. It MUST be pure and return a new value: mutating `prev` in place and
 * returning the same reference makes `CacheService` short-circuit on
 * `deepEqual(stored, value)` and silently skip the subscriber notification.
 *
 * "Pure" also means no side effects inside the updater: do not smuggle a derived
 * result out (e.g. by writing to an enclosing-scope variable) to drive post-write
 * work, and do not assume how many times or when it runs. To react to *what
 * changed* — e.g. dispose resources for items that were removed — derive it from
 * the value transition in a `useEffect` that watches the value, not from inside
 * the updater.
 */
type CacheSetStateAction<T> = T | ((prev: ReadonlyValue<T>) => T);

// ============================================================================
// Hooks
// ============================================================================

/**
 * React hook for component-level memory cache
 *
 * Use this for data that needs to be shared between components. Data is lost
 * when the app restarts.
 *
 * Supports both fixed keys and template keys:
 * - Fixed keys: `useCache('app.user.avatar')`
 * - Template keys: `useCache('scroll.position.topic123')` (matches schema `'scroll.position.${id}'`)
 *
 * @param key - Cache key from the predefined schema (fixed or matching template pattern)
 * @param initValue - Initial value (optional, uses schema default if not provided)
 * @returns [value, setValue] - Similar to useState but shared across components
 *
 * @remarks
 * The setter accepts a value or an updater `(prev) => next`, like React's
 * `useState`. The updater MUST be pure: it runs against the latest stored value
 * and must return a new value — mutating `prev` in place and returning the same
 * reference is short-circuited by `deepEqual` and silently skips the re-render.
 */
export function useCache<K extends UseCacheKey>(
  key: K,
  initValue?: InferUseCacheValue<K>,
): [InferUseCacheValue<K>, (value: CacheSetStateAction<InferUseCacheValue<K>>) => void] {
  // Get the default value for this key (works with both fixed and template keys)
  const defaultValue = getUseCacheDefaultValue(key);

  /**
   * Subscribe to cache changes using React's useSyncExternalStore
   * This ensures the component re-renders when the cache value changes
   */
  const value = useSyncExternalStore(
    useCallback((callback) => cacheService.subscribe(key, callback), [key]),
    useCallback(() => cacheService.get(key), [key]),
    useCallback(() => cacheService.get(key), [key]), // SSR snapshot
  );

  /**
   * Initialize cache with default value if it doesn't exist
   * Priority: existing cache value > custom initValue > schema default (via template matching)
   */
  useEffect(() => {
    if (cacheService.has(key)) {
      return;
    }

    if (initValue !== undefined) {
      cacheService.set(key, initValue);
    } else if (defaultValue !== undefined) {
      cacheService.set(key, defaultValue);
    }
  }, [key, initValue, defaultValue]);

  /**
   * Register this hook as actively using the cache key
   * This prevents the cache service from deleting the key while the hook is active
   */
  useEffect(() => {
    cacheService.registerHook(key);
    return () => cacheService.unregisterHook(key);
  }, [key]);

  /**
   * Warn developers when using TTL with hooks
   * TTL can cause values to expire between renders, leading to unstable behavior
   */
  useEffect(() => {
    if (cacheService.hasTTL(key)) {
      logger.warn(
        `useCache hook for key "${key}" is using a cache with TTL. This may cause unstable behavior as the value can expire between renders.`,
      );
    }
  }, [key]);

  /**
   * Memoized setter function for updating the cache value.
   * Accepts a concrete value or a functional updater `(prev) => next`. The
   * updater is resolved against the latest stored value via the same default
   * fallback chain as the hook return (`get ?? initValue ?? schema default`),
   * so it stays correct across an `await`.
   */
  const setValue = useCallback(
    (newValue: CacheSetStateAction<InferUseCacheValue<K>>) => {
      if (typeof newValue === 'function') {
        const prev = (cacheService.get(key) ?? initValue ?? defaultValue) as ReadonlyValue<
          InferUseCacheValue<K>
        >;
        cacheService.set(key, newValue(prev));
      } else {
        cacheService.set(key, newValue);
      }
    },
    [key, initValue, defaultValue],
  );

  // Every schema key ships a default, so the chain never actually falls through
  // for valid keys; the cast documents that contract without a non-null assertion.
  return [(value ?? initValue ?? defaultValue) as InferUseCacheValue<K>, setValue];
}

/**
 * React hook for persistent cache
 *
 * Use this for data that needs to persist across app restarts. Data is
 * synchronously written through to the MMKV-backed store.
 *
 * @param key - Cache key from the predefined schema
 * @returns [value, setValue] - Similar to useState but persisted
 *
 * @remarks
 * The setter accepts a value or an updater `(prev) => next`, resolved against the
 * latest persisted value (`getPersist`, which always returns the stored value or
 * the schema default). Keep the updater pure and return a new value (see `useCache`).
 */
export function usePersistCache<K extends PersistCacheKey>(
  key: K,
): [PersistCacheSchema[K], (value: CacheSetStateAction<PersistCacheSchema[K]>) => void] {
  /**
   * Subscribe to persist cache changes using React's useSyncExternalStore
   * This ensures the component re-renders when the persist cache value changes
   */
  const value = useSyncExternalStore(
    useCallback((callback) => cacheService.subscribe(key, callback), [key]),
    useCallback(() => cacheService.getPersist(key), [key]),
    useCallback(() => cacheService.getPersist(key), [key]), // SSR snapshot
  );

  /**
   * Register this hook as actively using the persist cache key
   * This prevents the cache service from deleting the key while the hook is active
   * Note: Persist cache keys are predefined and generally not deleted
   */
  useEffect(() => {
    cacheService.registerHook(key);
    return () => cacheService.unregisterHook(key);
  }, [key]);

  /**
   * Memoized setter function for updating the persist cache value.
   * Accepts a concrete value or a functional updater `(prev) => next` resolved
   * against the latest persisted value (`getPersist` never returns undefined).
   */
  const setValue = useCallback(
    (newValue: CacheSetStateAction<PersistCacheSchema[K]>) => {
      if (typeof newValue === 'function') {
        const prev = cacheService.getPersist(key) as ReadonlyValue<PersistCacheSchema[K]>;
        cacheService.setPersist(key, newValue(prev));
      } else {
        cacheService.setPersist(key, newValue);
      }
    },
    [key],
  );

  return [value, setValue];
}
