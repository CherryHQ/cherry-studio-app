/**
 * @fileoverview useCache - React hook for subscribing to cache changes
 *
 * This hook provides real-time access to CacheService data.
 * When the cached value changes, the component using this hook will re-render.
 *
 * Usage:
 * ```typescript
 * const block = useCache<MessageBlock>(getBlockKey(blockId))
 * ```
 */

import { useEffect, useState } from 'react'

import { cacheService } from '@/services/CacheService'

/**
 * Subscribe to cache changes for a specific key
 *
 * @param key - Cache key to subscribe to
 * @returns The cached value (undefined if not found)
 */
export function useCache<T>(key: string): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => cacheService.get<T>(key))

  useEffect(() => {
    // Subscribe to cache changes
    const unsubscribe = cacheService.subscribe(key, () => {
      setValue(cacheService.get<T>(key))
    })

    return unsubscribe
  }, [key])

  return value
}
