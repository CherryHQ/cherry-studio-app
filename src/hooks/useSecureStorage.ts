/**
 * useSecureStorage Hook
 *
 * React hook for secure storage operations using expo-secure-store.
 * This hook ensures SecureStore is only loaded in React components,
 * avoiding early native module access during app initialization.
 *
 * Usage:
 * ```tsx
 * const { getItem, setItem, deleteItem } = useSecureStorage()
 *
 * // In an async function or useEffect
 * const value = await getItem('myKey')
 * await setItem('myKey', 'myValue')
 * await deleteItem('myKey')
 * ```
 */

import * as SecureStore from 'expo-secure-store'
import { useCallback, useRef } from 'react'

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('useSecureStorage')

export interface UseSecureStorageReturn {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  deleteItem: (key: string) => Promise<void>
  isAvailable: () => boolean
}

export function useSecureStorage(): UseSecureStorageReturn {
  const isAvailableRef = useRef(true)

  const getItem = useCallback(async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key)
    } catch (error) {
      logger.error(`Failed to get secure item: ${key}`, error as Error)
      return null
    }
  }, [])

  const setItem = useCallback(async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch (error) {
      logger.error(`Failed to set secure item: ${key}`, error as Error)
      throw error
    }
  }, [])

  const deleteItem = useCallback(async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch (error) {
      logger.error(`Failed to delete secure item: ${key}`, error as Error)
      throw error
    }
  }, [])

  const isAvailable = useCallback(() => {
    return isAvailableRef.current
  }, [])

  return {
    getItem,
    setItem,
    deleteItem,
    isAvailable
  }
}
