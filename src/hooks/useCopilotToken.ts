/**
 * useCopilotToken Hook
 *
 * Manages GitHub Copilot access token using secure storage.
 */

import { useCallback, useEffect, useState } from 'react'

import { loggerService } from '@/services/LoggerService'

import { useSecureStorage } from './useSecureStorage'

const logger = loggerService.withContext('useCopilotToken')

const COPILOT_TOKEN_KEY = 'copilot_access_token'

export interface UseCopilotTokenReturn {
  token: string | null
  isLoading: boolean
  hasToken: boolean
  saveToken: (token: string) => Promise<void>
  deleteToken: () => Promise<void>
  loadToken: () => Promise<void>
}

export function useCopilotToken(autoLoad = true): UseCopilotTokenReturn {
  const { getItem, setItem, deleteItem } = useSecureStorage()
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadToken = useCallback(async () => {
    setIsLoading(true)
    try {
      const storedToken = await getItem(COPILOT_TOKEN_KEY)
      setToken(storedToken)
    } catch (error) {
      logger.error('Failed to load Copilot token:', error as Error)
      setToken(null)
    } finally {
      setIsLoading(false)
    }
  }, [getItem])

  const saveToken = useCallback(
    async (newToken: string) => {
      try {
        await setItem(COPILOT_TOKEN_KEY, newToken)
        setToken(newToken)
        logger.info('Copilot token saved successfully')
      } catch (error) {
        logger.error('Failed to save Copilot token:', error as Error)
        throw error
      }
    },
    [setItem]
  )

  const deleteToken = useCallback(async () => {
    try {
      await deleteItem(COPILOT_TOKEN_KEY)
      setToken(null)
      logger.info('Copilot token deleted successfully')
    } catch (error) {
      logger.error('Failed to delete Copilot token:', error as Error)
      throw error
    }
  }, [deleteItem])

  // Auto-load token on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadToken()
    }
  }, [autoLoad, loadToken])

  return {
    token,
    isLoading,
    hasToken: !!token,
    saveToken,
    deleteToken,
    loadToken
  }
}
