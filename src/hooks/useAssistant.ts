import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { assistantService } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

const logger = loggerService.withContext('useAssistant')

/**
 * React Hook for managing a specific assistant (Refactored with useSyncExternalStore)
 *
 * Uses AssistantService with optimistic updates for zero-latency UX.
 * Integrates with React 18's useSyncExternalStore for efficient re-renders.
 *
 * @param assistantId - The assistant ID to watch
 * @returns assistant data, loading state, and update method
 *
 * @example
 * ```typescript
 * function AssistantDetail({ assistantId }) {
 *   const { assistant, isLoading, updateAssistant } = useAssistant(assistantId)
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <div>
 *       <h1>{assistant.name}</h1>
 *       <button onClick={() => updateAssistant({ name: 'New Name' })}>Rename</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useAssistant(assistantId: string) {
  // ==================== Early Return for Invalid ID ====================

  const isValidId = assistantId && assistantId.trim() !== ''

  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to specific assistant changes
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!isValidId) {
        // Return a no-op unsubscribe for invalid IDs
        return () => {}
      }
      logger.verbose(`Subscribing to assistant ${assistantId} changes`)
      return assistantService.subscribeAssistant(assistantId, callback)
    },
    [assistantId, isValidId]
  )

  /**
   * Get assistant snapshot (synchronous from cache)
   */
  const getSnapshot = useCallback(() => {
    if (!isValidId) {
      return null
    }
    return assistantService.getAssistantCached(assistantId)
  }, [assistantId, isValidId])

  /**
   * Server snapshot (for SSR compatibility - not used in React Native)
   */
  const getServerSnapshot = useCallback(() => {
    return null
  }, [])

  // Use useSyncExternalStore for reactive updates
  const assistant = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Loading State ====================

  /**
   * Track if we're loading the assistant from database
   */
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Load assistant from database if not cached
   */
  useEffect(() => {
    // Skip loading for invalid IDs
    if (!isValidId) {
      setIsLoading(false)
      return
    }

    if (!assistant) {
      setIsLoading(true)
      assistantService
        .getAssistant(assistantId)
        .then(() => {
          setIsLoading(false)
        })
        .catch(error => {
          logger.error(`Failed to load assistant ${assistantId}:`, error as Error)
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [assistant, assistantId, isValidId])

  // ==================== Action Methods ====================

  /**
   * Update assistant with optimistic updates
   */
  const updateAssistant = useCallback(
    async (updates: Partial<Omit<Assistant, 'id'>>) => {
      await assistantService.updateAssistant(assistantId, updates)
    },
    [assistantId]
  )

  // ==================== Return API ====================

  return {
    assistant,
    isLoading: !assistant && isLoading,
    updateAssistant
  }
}

/**
 * React Hook for getting all assistants
 *
 * Uses AssistantService with caching for optimal performance.
 *
 * @example
 * ```typescript
 * function AssistantList() {
 *   const { assistants, isLoading } = useAssistants()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <ul>
 *       {assistants.map(a => <li key={a.id}>{a.name}</li>)}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useAssistants() {
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    logger.verbose('Subscribing to all assistants changes')
    return assistantService.subscribeAllAssistants(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any assistant changes
      loadAllAssistants()
    })

    loadAllAssistants()

    return unsubscribe
  }, [subscribe])

  const loadAllAssistants = async () => {
    try {
      setIsLoading(true)
      const allAssistants = await assistantService.getAllAssistants()
      setAssistants(allAssistants)
    } catch (error) {
      logger.error('Failed to load all assistants:', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateAssistants = useCallback(async (updates: Assistant[]) => {
    for (const assistant of updates) {
      await assistantService.updateAssistant(assistant.id, assistant)
    }
  }, [])

  return {
    assistants,
    isLoading,
    updateAssistants
  }
}

/**
 * React Hook for getting external assistants (user-created)
 *
 * @example
 * ```typescript
 * function ExternalAssistantList() {
 *   const { assistants, isLoading } = useExternalAssistants()
 *
 *   return <AssistantList assistants={assistants} loading={isLoading} />
 * }
 * ```
 */
export function useExternalAssistants() {
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    return assistantService.subscribeAllAssistants(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any assistant changes
      loadExternalAssistants()
    })

    loadExternalAssistants()

    return unsubscribe
  }, [subscribe])

  const loadExternalAssistants = async () => {
    try {
      setIsLoading(true)
      const external = await assistantService.getExternalAssistants()
      setAssistants(external)
    } catch (error) {
      logger.error('Failed to load external assistants:', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateAssistants = useCallback(async (updates: Assistant[]) => {
    for (const assistant of updates) {
      await assistantService.updateAssistant(assistant.id, assistant)
    }
  }, [])

  return {
    assistants,
    isLoading,
    updateAssistants
  }
}

/**
 * React Hook for getting built-in assistants
 *
 * @example
 * ```typescript
 * function BuiltInAssistantList() {
 *   const { assistants, isLoading, resetBuiltInAssistants } = useBuiltInAssistants()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <div>
 *       {assistants.map(a => <AssistantCard key={a.id} assistant={a} />)}
 *       <button onClick={resetBuiltInAssistants}>Reset to Default</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useBuiltInAssistants() {
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    return assistantService.subscribeBuiltInAssistants(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any built-in assistant changes
      loadBuiltInAssistants()
    })

    loadBuiltInAssistants()

    return unsubscribe
  }, [subscribe])

  const loadBuiltInAssistants = async () => {
    try {
      setIsLoading(true)
      const builtIn = await assistantService.getBuiltInAssistants()
      setAssistants(builtIn)
    } catch (error) {
      logger.error('Failed to load built-in assistants:', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetBuiltInAssistants = useCallback(() => {
    assistantService.resetBuiltInAssistants()
  }, [])

  const updateAssistants = useCallback(async (updates: Assistant[]) => {
    for (const assistant of updates) {
      await assistantService.updateAssistant(assistant.id, assistant)
    }
  }, [])

  return {
    assistants,
    isLoading,
    resetBuiltInAssistants,
    updateAssistants
  }
}
