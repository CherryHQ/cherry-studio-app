/**
 * usePreference - React Hook for managing preference values
 *
 * This hook provides a React-friendly interface to the PreferenceService,
 * using React 18's useSyncExternalStore for optimal integration with
 * concurrent rendering and automatic subscriptions.
 *
 * Features:
 * - Automatic subscription to preference changes
 * - Type-safe value access with automatic type inference
 * - Lazy loading on first access
 * - Default value fallback
 * - Optimistic updates with rollback on error
 *
 * @example Basic Usage
 * ```typescript
 * function ThemeSettings() {
 *   const [theme, setTheme] = usePreference('ui.theme_mode')
 *
 *   return (
 *     <select value={theme} onChange={(e) => setTheme(e.target.value)}>
 *       <option value="light">Light</option>
 *       <option value="dark">Dark</option>
 *       <option value="system">System</option>
 *     </select>
 *   )
 * }
 * ```
 *
 * @example With Error Handling
 * ```typescript
 * const [theme, setTheme] = usePreference('ui.theme_mode')
 *
 * const handleThemeChange = async (newTheme) => {
 *   try {
 *     await setTheme(newTheme)
 *   } catch (error) {
 *     console.error('Failed to update theme:', error)
 *     showToast('Failed to save theme preference')
 *   }
 * }
 * ```
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

import { loggerService } from '@/services/LoggerService'
import { preferenceService } from '@/services/PreferenceService'
import { DefaultPreferences } from '@/shared/data/preference/preferenceSchemas'
import type { PreferenceDefaultScopeType, PreferenceKeyType } from '@/shared/data/preference/preferenceTypes'

const logger = loggerService.withContext('usePreference')

/**
 * React Hook for managing a single preference value
 *
 * Integrates with React's useSyncExternalStore for automatic re-renders
 * when the preference value changes. Supports both local updates and
 * cross-component synchronization.
 *
 * @param key - The preference key to manage (e.g., 'ui.theme_mode')
 * @returns Tuple of [value, setValue] similar to useState
 *
 * @template K - The preference key type (automatically inferred)
 *
 * Type Safety:
 * - value: Automatically typed based on the key
 * - setValue: Accepts only values of the correct type for the key
 *
 * Performance:
 * - Uses useSyncExternalStore for efficient re-renders
 * - Caches subscription and snapshot functions
 * - Only re-subscribes when key changes
 *
 * @example
 * ```typescript
 * const [userName, setUserName] = usePreference('user.name')
 * // userName: string
 * // setUserName: (value: string) => Promise<void>
 *
 * const [maxResults, setMaxResults] = usePreference('websearch.max_results')
 * // maxResults: number
 * // setMaxResults: (value: number) => Promise<void>
 * ```
 */
export function usePreference<K extends PreferenceKeyType>(
  key: K
): [value: PreferenceDefaultScopeType[K], setValue: (value: PreferenceDefaultScopeType[K]) => Promise<void>] {
  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to preference changes
   *
   * This function is called by useSyncExternalStore to register a listener.
   * It's memoized with useCallback to avoid unnecessary re-subscriptions.
   *
   * @param callback - React's re-render trigger function
   * @returns Unsubscribe function
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      logger.verbose(`Subscribing to preference: ${key}`)
      return preferenceService.subscribe(key, callback)
    },
    [key]
  )

  /**
   * Get current cached value (snapshot)
   *
   * This function is called by useSyncExternalStore to get the current value.
   * Returns undefined if not yet cached (will be loaded asynchronously).
   *
   * @returns Current cached value or undefined
   */
  const getSnapshot = useCallback(() => {
    return preferenceService.getCached(key)
  }, [key])

  /**
   * Get server snapshot (for SSR compatibility)
   *
   * React Native doesn't use SSR, but useSyncExternalStore requires this.
   * We return undefined to indicate no server-side value.
   */
  const getServerSnapshot = useCallback(() => {
    return undefined
  }, [])

  // Use useSyncExternalStore for reactive updates
  const cachedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Lazy Loading ====================

  /**
   * Load preference value on first access
   *
   * If the value is not yet cached, trigger an async load from the database.
   * This effect runs only when the cached value is undefined.
   */
  useEffect(() => {
    if (cachedValue === undefined) {
      logger.debug(`Initial load for preference: ${key}`)

      preferenceService.get(key).catch(error => {
        logger.error(`Failed to load preference ${key}:`, error as Error)
      })
    }
  }, [key, cachedValue])

  // ==================== Value with Default Fallback ====================

  /**
   * Compute final value with default fallback
   *
   * If the cached value is undefined (not yet loaded), return the default value.
   * This ensures the hook always returns a valid value, never undefined.
   */
  const value = useMemo(() => {
    if (cachedValue !== undefined) {
      return cachedValue
    }

    // Fallback to default value
    const defaultValue = DefaultPreferences.default[key]
    logger.verbose(`Using default value for ${key}: ${JSON.stringify(defaultValue)}`)
    return defaultValue as PreferenceDefaultScopeType[K]
  }, [cachedValue, key])

  // ==================== Setter Function ====================

  /**
   * Update preference value
   *
   * This function is memoized to maintain referential equality across renders.
   * It performs an optimistic update through the PreferenceService.
   *
   * @param newValue - The new value to set
   * @throws Error if database write fails (after rollback)
   */
  const setValue = useCallback(
    async (newValue: PreferenceDefaultScopeType[K]) => {
      try {
        logger.debug(`Setting preference ${key} to ${JSON.stringify(newValue)}`)
        await preferenceService.set(key, newValue)
      } catch (error) {
        logger.error(`Failed to set preference ${key}:`, error as Error)
        // Re-throw for caller to handle
        throw error
      }
    },
    [key]
  )

  // ==================== Return Tuple ====================

  return [value, setValue]
}

/**
 * React Hook for managing multiple preferences at once
 *
 * More efficient than using multiple usePreference hooks when you need
 * to access several related preferences together.
 *
 * @param keys - Object mapping local names to preference keys
 * @returns Tuple of [values, setValues]
 *
 * @example
 * ```typescript
 * const [settings, updateSettings] = useMultiplePreferences({
 *   theme: 'ui.theme_mode',
 *   fontSize: 'chat.message.font_size',
 *   userName: 'user.name'
 * })
 *
 * // Access individual values
 * console.log(settings.theme)      // ThemeMode
 * console.log(settings.fontSize)   // number
 * console.log(settings.userName)   // string
 *
 * // Update multiple values
 * await updateSettings({
 *   theme: 'dark',
 *   fontSize: 16
 * })
 * ```
 */
export function useMultiplePreferences<T extends Record<string, PreferenceKeyType>>(
  keys: T
): [
  values: { [P in keyof T]: PreferenceDefaultScopeType[T[P]] },
  setValues: (updates: Partial<{ [P in keyof T]: PreferenceDefaultScopeType[T[P]] }>) => Promise<void>
] {
  // Extract preference keys as array
  const preferenceKeys = useMemo(() => Object.values(keys), [keys])

  // ==================== Subscription ====================

  /**
   * Subscribe to all keys
   *
   * Creates a single subscription that listens to all specified preference keys.
   * Returns a combined unsubscribe function.
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      logger.verbose(`Subscribing to multiple preferences: ${preferenceKeys.join(', ')}`)

      // Subscribe to each key
      const unsubscribeFunctions = preferenceKeys.map(key => {
        return preferenceService.subscribe(key, callback)
      })

      // Return combined unsubscribe function
      return () => {
        unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
      }
    },
    [preferenceKeys]
  )

  /**
   * Get snapshot of all values
   */
  const getSnapshot = useCallback(() => {
    const snapshot: Record<string, any> = {}

    for (const [localKey, prefKey] of Object.entries(keys)) {
      snapshot[localKey] = preferenceService.getCached(prefKey)
    }

    return snapshot
  }, [keys])

  const getServerSnapshot = useCallback(() => ({}), [])

  // Use useSyncExternalStore
  const cachedValues = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Lazy Loading ====================

  useEffect(() => {
    const uncachedKeys = preferenceKeys.filter(key => {
      const localKey = Object.keys(keys).find(k => keys[k] === key)
      return localKey && cachedValues[localKey] === undefined
    })

    if (uncachedKeys.length > 0) {
      logger.debug(`Initial load for multiple preferences: ${uncachedKeys.join(', ')}`)

      preferenceService.getMultiple(uncachedKeys).catch(error => {
        logger.error('Failed to load multiple preferences:', error as Error)
      })
    }
  }, [keys, cachedValues, preferenceKeys])

  // ==================== Values with Defaults ====================

  const values = useMemo(() => {
    const result: Record<string, any> = {}

    for (const [localKey, prefKey] of Object.entries(keys)) {
      const cachedValue = cachedValues[localKey]
      result[localKey] = cachedValue !== undefined ? cachedValue : DefaultPreferences.default[prefKey]
    }

    return result as { [P in keyof T]: PreferenceDefaultScopeType[T[P]] }
  }, [keys, cachedValues])

  // ==================== Setter Function ====================

  const setValues = useCallback(
    async (updates: Partial<{ [P in keyof T]: PreferenceDefaultScopeType[T[P]] }>) => {
      try {
        // Convert local keys back to preference keys
        const prefUpdates: Partial<PreferenceDefaultScopeType> = {}

        for (const [localKey, value] of Object.entries(updates)) {
          const prefKey = keys[localKey as keyof T]
          if (prefKey) {
            prefUpdates[prefKey] = value as any
          }
        }

        logger.debug(`Setting multiple preferences: ${Object.keys(prefUpdates).join(', ')}`)
        await preferenceService.setMultiple(prefUpdates)
      } catch (error) {
        logger.error('Failed to set multiple preferences:', error as Error)
        throw error
      }
    },
    [keys]
  )

  return [values, setValues]
}
