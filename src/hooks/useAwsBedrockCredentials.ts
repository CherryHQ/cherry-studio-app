/**
 * useAwsBedrockCredentials Hook
 *
 * Manages AWS Bedrock credentials using secure storage.
 * This hook handles all SecureStore interactions for AWS Bedrock configuration.
 */

import { useCallback, useEffect, useState } from 'react'

import { AWS_BEDROCK_KEYS, type AwsBedrockCredentials } from '@/services/AwsBedrockService'
import { loggerService } from '@/services/LoggerService'

import { useSecureStorage } from './useSecureStorage'

const logger = loggerService.withContext('useAwsBedrockCredentials')

export interface UseAwsBedrockCredentialsReturn {
  credentials: AwsBedrockCredentials | null
  isLoading: boolean
  isConfigured: boolean
  saveCredentials: (providerId: string, credentials: AwsBedrockCredentials) => Promise<void>
  deleteCredentials: (providerId: string) => Promise<void>
  loadCredentials: (providerId: string) => Promise<void>
}

export function useAwsBedrockCredentials(providerId?: string): UseAwsBedrockCredentialsReturn {
  const { getItem, setItem, deleteItem } = useSecureStorage()
  const [credentials, setCredentials] = useState<AwsBedrockCredentials | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadCredentials = useCallback(
    async (id: string) => {
      setIsLoading(true)
      try {
        const [accessKeyId, secretAccessKey, region] = await Promise.all([
          getItem(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${id}`),
          getItem(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${id}`),
          getItem(`${AWS_BEDROCK_KEYS.REGION}_${id}`)
        ])

        if (accessKeyId && secretAccessKey && region) {
          setCredentials({ accessKeyId, secretAccessKey, region })
        } else {
          setCredentials(null)
        }
      } catch (error) {
        logger.error('Failed to load AWS Bedrock credentials:', error as Error)
        setCredentials(null)
      } finally {
        setIsLoading(false)
      }
    },
    [getItem]
  )

  const saveCredentials = useCallback(
    async (id: string, creds: AwsBedrockCredentials) => {
      try {
        await Promise.all([
          setItem(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${id}`, creds.accessKeyId),
          setItem(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${id}`, creds.secretAccessKey),
          setItem(`${AWS_BEDROCK_KEYS.REGION}_${id}`, creds.region)
        ])
        setCredentials(creds)
        logger.info(`AWS Bedrock credentials saved for provider: ${id}`)
      } catch (error) {
        logger.error('Failed to save AWS Bedrock credentials:', error as Error)
        throw error
      }
    },
    [setItem]
  )

  const deleteCredentials = useCallback(
    async (id: string) => {
      try {
        await Promise.all([
          deleteItem(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${id}`),
          deleteItem(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${id}`),
          deleteItem(`${AWS_BEDROCK_KEYS.REGION}_${id}`)
        ])
        setCredentials(null)
        logger.info(`AWS Bedrock credentials deleted for provider: ${id}`)
      } catch (error) {
        logger.error('Failed to delete AWS Bedrock credentials:', error as Error)
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

  const isConfigured = !!(credentials?.accessKeyId && credentials?.secretAccessKey && credentials?.region)

  return {
    credentials,
    isLoading,
    isConfigured,
    saveCredentials,
    deleteCredentials,
    loadCredentials
  }
}
