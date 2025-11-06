/**
 * useVertexAICredentials Hook
 *
 * Manages Google Vertex AI credentials using secure storage.
 */

import { useCallback, useEffect, useState } from 'react'

import { loggerService } from '@/services/LoggerService'

import { useSecureStorage } from './useSecureStorage'

const logger = loggerService.withContext('useVertexAICredentials')

export const VERTEX_KEYS = {
  PRIVATE_KEY: 'vertex_private_key',
  CLIENT_EMAIL: 'vertex_client_email',
  PROJECT: 'vertex_project',
  LOCATION: 'vertex_location'
} as const

export interface VertexAICredentials {
  privateKey: string
  clientEmail: string
  project: string
  location: string
}

export interface UseVertexAICredentialsReturn {
  credentials: VertexAICredentials | null
  isLoading: boolean
  isConfigured: boolean
  saveCredentials: (providerId: string, credentials: VertexAICredentials) => Promise<void>
  deleteCredentials: (providerId: string) => Promise<void>
  loadCredentials: (providerId: string) => Promise<void>
}

export function useVertexAICredentials(providerId?: string): UseVertexAICredentialsReturn {
  const { getItem, setItem, deleteItem } = useSecureStorage()
  const [credentials, setCredentials] = useState<VertexAICredentials | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadCredentials = useCallback(
    async (id: string) => {
      setIsLoading(true)
      try {
        const [privateKey, clientEmail, project, location] = await Promise.all([
          getItem(`${VERTEX_KEYS.PRIVATE_KEY}_${id}`),
          getItem(`${VERTEX_KEYS.CLIENT_EMAIL}_${id}`),
          getItem(`${VERTEX_KEYS.PROJECT}_${id}`),
          getItem(`${VERTEX_KEYS.LOCATION}_${id}`)
        ])

        if (privateKey && clientEmail && project && location) {
          setCredentials({ privateKey, clientEmail, project, location })
        } else {
          setCredentials(null)
        }
      } catch (error) {
        logger.error('Failed to load Vertex AI credentials:', error as Error)
        setCredentials(null)
      } finally {
        setIsLoading(false)
      }
    },
    [getItem]
  )

  const saveCredentials = useCallback(
    async (id: string, creds: VertexAICredentials) => {
      try {
        await Promise.all([
          setItem(`${VERTEX_KEYS.PRIVATE_KEY}_${id}`, creds.privateKey),
          setItem(`${VERTEX_KEYS.CLIENT_EMAIL}_${id}`, creds.clientEmail),
          setItem(`${VERTEX_KEYS.PROJECT}_${id}`, creds.project),
          setItem(`${VERTEX_KEYS.LOCATION}_${id}`, creds.location)
        ])
        setCredentials(creds)
        logger.info(`Vertex AI credentials saved for provider: ${id}`)
      } catch (error) {
        logger.error('Failed to save Vertex AI credentials:', error as Error)
        throw error
      }
    },
    [setItem]
  )

  const deleteCredentials = useCallback(
    async (id: string) => {
      try {
        await Promise.all([
          deleteItem(`${VERTEX_KEYS.PRIVATE_KEY}_${id}`),
          deleteItem(`${VERTEX_KEYS.CLIENT_EMAIL}_${id}`),
          deleteItem(`${VERTEX_KEYS.PROJECT}_${id}`),
          deleteItem(`${VERTEX_KEYS.LOCATION}_${id}`)
        ])
        setCredentials(null)
        logger.info(`Vertex AI credentials deleted for provider: ${id}`)
      } catch (error) {
        logger.error('Failed to delete Vertex AI credentials:', error as Error)
        throw error
      }
    },
    [deleteItem]
  )

  // Auto-load credentials when providerId changes
  useEffect(() => {
    if (providerId) {
      loadCredentials(providerId)
    }
  }, [providerId, loadCredentials])

  const isConfigured = !!(
    credentials?.privateKey &&
    credentials?.clientEmail &&
    credentials?.project &&
    credentials?.location
  )

  return {
    credentials,
    isLoading,
    isConfigured,
    saveCredentials,
    deleteCredentials,
    loadCredentials
  }
}
