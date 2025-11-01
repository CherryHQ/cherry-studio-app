import { db } from '@db'
import { transformDbToWebSearchProvider } from '@db/mappers'
import { websearch_providers } from '@db/schema'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { loggerService } from '@/services/LoggerService'
import { webSearchProviderService } from '@/services/WebSearchProviderService'
import type { WebSearchProvider } from '@/types/websearch'

import { usePreference } from './usePreference'

const logger = loggerService.withContext('useWebsearchProviders')

/**
 * React Hook for managing a specific WebSearch provider (Refactored with useSyncExternalStore)
 *
 * Uses WebSearchProviderService with optimistic updates for zero-latency UX.
 * Integrates with React 18's useSyncExternalStore for efficient re-renders.
 *
 * @param providerId - The WebSearch provider ID to manage
 *
 * @example
 * ```typescript
 * function WebSearchProviderDetail({ providerId }) {
 *   const {
 *     provider,
 *     isLoading,
 *     updateProvider,
 *     deleteProvider
 *   } = useWebSearchProvider(providerId)
 *
 *   return (
 *     <div>
 *       Provider: {provider?.name}
 *       <button onClick={() => updateProvider({ apiKey: 'new-key' })}>
 *         Update API Key
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useWebSearchProvider(providerId: string) {
  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to WebSearch provider changes
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      logger.verbose(`Subscribing to WebSearch provider changes: ${providerId}`)
      return webSearchProviderService.subscribeProvider(providerId, callback)
    },
    [providerId]
  )

  /**
   * Get WebSearch provider snapshot (synchronous)
   */
  const getSnapshot = useCallback(() => {
    return webSearchProviderService.getProviderCached(providerId)
  }, [providerId])

  /**
   * Server snapshot (for SSR compatibility - not used in React Native)
   */
  const getServerSnapshot = useCallback(() => {
    return null
  }, [])

  // Use useSyncExternalStore for reactive updates
  const provider = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Loading State ====================

  /**
   * Track if we're loading the WebSearch provider from database
   */
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Validate providerId
   */
  const isValidId = providerId && providerId.length > 0

  /**
   * Load WebSearch provider on mount if not cached
   */
  useEffect(() => {
    let cancelled = false

    if (!provider && isValidId) {
      setIsLoading(true)
      webSearchProviderService
        .getProvider(providerId)
        .then(() => {
          if (!cancelled) {
            setIsLoading(false)
          }
        })
        .catch(error => {
          if (!cancelled) {
            logger.error(`Failed to load WebSearch provider ${providerId}:`, error as Error)
            setIsLoading(false)
          }
        })
    }

    return () => {
      cancelled = true
    }
  }, [provider, providerId, isValidId])

  // ==================== Action Methods ====================

  /**
   * Update WebSearch provider (optimistic)
   */
  const updateProvider = useCallback(
    async (updates: Partial<Omit<WebSearchProvider, 'id'>>) => {
      try {
        await webSearchProviderService.updateProvider(providerId, updates)
      } catch (error) {
        logger.error(`Failed to update WebSearch provider ${providerId}:`, error as Error)
        throw error
      }
    },
    [providerId]
  )

  /**
   * Delete WebSearch provider (optimistic)
   */
  const deleteProvider = useCallback(async () => {
    try {
      await webSearchProviderService.deleteProvider(providerId)
    } catch (error) {
      logger.error(`Failed to delete WebSearch provider ${providerId}:`, error as Error)
      throw error
    }
  }, [providerId])

  // ==================== Return Values ====================

  return {
    provider,
    isLoading,
    updateProvider,
    deleteProvider
  }
}

/**
 * React Hook for managing all WebSearch providers (Using useLiveQuery)
 *
 * Uses Drizzle's useLiveQuery for reactive database updates.
 * NOTE: Kept as useLiveQuery for now, will migrate to useSyncExternalStore later.
 *
 * @example
 * ```typescript
 * function WebSearchProviderList() {
 *   const { freeProviders, apiProviders, isLoading } = useWebsearchProviders()
 *
 *   return (
 *     <div>
 *       <h2>Free Providers</h2>
 *       {freeProviders.map(provider => (
 *         <div key={provider.id}>{provider.name}</div>
 *       ))}
 *       <h2>API Providers</h2>
 *       {apiProviders.map(provider => (
 *         <div key={provider.id}>{provider.name}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useWebsearchProviders() {
  const query = db.select().from(websearch_providers)
  const { data: rawProviders, updatedAt } = useLiveQuery(query)

  const processedProviders = useMemo(() => {
    if (!rawProviders || rawProviders.length === 0) return []
    return rawProviders.map(provider => transformDbToWebSearchProvider(provider))
  }, [rawProviders])

  const freeProviders = useMemo(() => {
    return processedProviders
      .filter(provider => provider.id.startsWith('local-'))
      .filter(provider => provider.id !== 'builtin')
  }, [processedProviders])

  const apiProviders = useMemo(() => {
    return processedProviders
      .filter(provider => !provider.id.startsWith('local-') && provider.id !== 'searxng')
      .filter(provider => provider.id !== 'builtin')
  }, [processedProviders])

  if (!updatedAt || !rawProviders || rawProviders.length === 0) {
    return {
      freeProviders: [],
      apiProviders: [],
      isLoading: true
    }
  }

  return {
    freeProviders,
    apiProviders,
    isLoading: false
  }
}

/**
 * React Hook for fetching all WebSearch providers (Using useLiveQuery)
 *
 * Uses Drizzle's useLiveQuery for reactive database updates.
 * NOTE: Kept as useLiveQuery for now, will migrate to useSyncExternalStore later.
 *
 * @example
 * ```typescript
 * function AllProvidersList() {
 *   const { providers, isLoading } = useAllWebSearchProviders()
 *
 *   return (
 *     <div>
 *       All Providers: {providers.length}
 *       {providers.map(provider => (
 *         <div key={provider.id}>{provider.name}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useAllWebSearchProviders() {
  const query = db.select().from(websearch_providers)
  const { data: rawProviders, updatedAt } = useLiveQuery(query)

  const providers = useMemo(() => {
    if (!rawProviders || rawProviders.length === 0) return []
    return rawProviders.map(provider => transformDbToWebSearchProvider(provider))
  }, [rawProviders])

  if (!updatedAt || !rawProviders || rawProviders.length === 0) {
    return {
      providers: [],
      isLoading: true
    }
  }

  return {
    providers,
    isLoading: false
  }
}

/**
 * Hook for managing websearch settings
 *
 * Now uses PreferenceService instead of Redux for better performance
 * and persistence.
 */
export function useWebsearchSettings() {
  // Get preferences using usePreference hooks
  const [searchWithDates, setSearchWithDatesRaw] = usePreference('websearch.search_with_time')
  const [overrideSearchService, setOverrideSearchServiceRaw] = usePreference('websearch.override_search_service')
  const [searchCount, setSearchCountRaw] = usePreference('websearch.max_results')
  const [contentLimit, setContentLimitRaw] = usePreference('websearch.content_limit')

  // Wrapper setters with validation (keeping same API as before)
  const setSearchWithDates = async (value: boolean) => {
    await setSearchWithDatesRaw(value)
  }

  const setOverrideSearchServiceSetting = async (value: boolean) => {
    await setOverrideSearchServiceRaw(value)
  }

  const setSearchCountSetting = async (value: number) => {
    if (typeof value === 'number' && !isNaN(value) && value >= 1 && value <= 20) {
      await setSearchCountRaw(Math.round(value))
    }
  }

  const setContentLimitSetting = async (value: number | undefined) => {
    if (value === undefined || (typeof value === 'number' && !isNaN(value) && value > 0)) {
      await setContentLimitRaw(value)
    }
  }

  return {
    // State
    searchWithDates,
    overrideSearchService,
    searchCount,
    contentLimit,
    // Actions (now async)
    setSearchWithDates,
    setOverrideSearchService: setOverrideSearchServiceSetting,
    setSearchCount: setSearchCountSetting,
    setContentLimit: setContentLimitSetting
  }
}
