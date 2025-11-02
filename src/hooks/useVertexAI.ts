import * as SecureStore from 'expo-secure-store'

import { loggerService } from '@/services/LoggerService'
import type { Provider, VertexProvider } from '@/types/assistant'

const logger = loggerService.withContext('useVertexAI')

const VERTEX_KEYS = {
  PRIVATE_KEY: 'vertex_private_key',
  CLIENT_EMAIL: 'vertex_client_email',
  PROJECT: 'vertex_project',
  LOCATION: 'vertex_location'
} as const

/**
 * Check if VertexAI provider is properly configured
 */
export function isVertexProvider(provider: Provider): provider is VertexProvider {
  return provider.type === 'vertexai' || provider.isVertex === true
}

/**
 * Check if VertexAI has all required configuration
 */
export async function isVertexAIConfigured(provider: Provider): Promise<boolean> {
  if (!isVertexProvider(provider)) return false

  try {
    const [privateKey, clientEmail, project, location] = await Promise.all([
      SecureStore.getItemAsync(`${VERTEX_KEYS.PRIVATE_KEY}_${provider.id}`),
      SecureStore.getItemAsync(`${VERTEX_KEYS.CLIENT_EMAIL}_${provider.id}`),
      SecureStore.getItemAsync(`${VERTEX_KEYS.PROJECT}_${provider.id}`),
      SecureStore.getItemAsync(`${VERTEX_KEYS.LOCATION}_${provider.id}`)
    ])

    return !!(privateKey && clientEmail && project && location)
  } catch (error) {
    logger.error('Failed to check VertexAI configuration:', error as Error)
    return false
  }
}

/**
 * Get VertexAI credentials
 */
export async function getVertexCredentials(
  providerId: string
): Promise<{ privateKey: string; clientEmail: string; project: string; location: string } | null> {
  try {
    const [privateKey, clientEmail, project, location] = await Promise.all([
      SecureStore.getItemAsync(`${VERTEX_KEYS.PRIVATE_KEY}_${providerId}`),
      SecureStore.getItemAsync(`${VERTEX_KEYS.CLIENT_EMAIL}_${providerId}`),
      SecureStore.getItemAsync(`${VERTEX_KEYS.PROJECT}_${providerId}`),
      SecureStore.getItemAsync(`${VERTEX_KEYS.LOCATION}_${providerId}`)
    ])

    if (!privateKey || !clientEmail || !project || !location) {
      return null
    }

    return { privateKey, clientEmail, project, location }
  } catch (error) {
    logger.error('Failed to get VertexAI credentials:', error as Error)
    return null
  }
}

/**
 * Save VertexAI credentials securely
 */
export async function saveVertexCredentials(
  providerId: string,
  credentials: {
    privateKey: string
    clientEmail: string
    project: string
    location: string
  }
): Promise<void> {
  try {
    await Promise.all([
      SecureStore.setItemAsync(`${VERTEX_KEYS.PRIVATE_KEY}_${providerId}`, credentials.privateKey),
      SecureStore.setItemAsync(`${VERTEX_KEYS.CLIENT_EMAIL}_${providerId}`, credentials.clientEmail),
      SecureStore.setItemAsync(`${VERTEX_KEYS.PROJECT}_${providerId}`, credentials.project),
      SecureStore.setItemAsync(`${VERTEX_KEYS.LOCATION}_${providerId}`, credentials.location)
    ])
    logger.info(`VertexAI credentials saved for provider: ${providerId}`)
  } catch (error) {
    logger.error('Failed to save VertexAI credentials:', error as Error)
    throw error
  }
}

/**
 * Delete VertexAI credentials
 */
export async function deleteVertexCredentials(providerId: string): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(`${VERTEX_KEYS.PRIVATE_KEY}_${providerId}`),
      SecureStore.deleteItemAsync(`${VERTEX_KEYS.CLIENT_EMAIL}_${providerId}`),
      SecureStore.deleteItemAsync(`${VERTEX_KEYS.PROJECT}_${providerId}`),
      SecureStore.deleteItemAsync(`${VERTEX_KEYS.LOCATION}_${providerId}`)
    ])
    logger.info(`VertexAI credentials deleted for provider: ${providerId}`)
  } catch (error) {
    logger.error('Failed to delete VertexAI credentials:', error as Error)
    throw error
  }
}

/**
 * Create a VertexAI provider with credentials
 */
export async function createVertexProvider(provider: Provider): Promise<VertexProvider | Provider> {
  if (!isVertexProvider(provider)) {
    return provider
  }

  const credentials = await getVertexCredentials(provider.id)
  if (!credentials) {
    return provider
  }

  return {
    ...provider,
    googleCredentials: {
      privateKey: credentials.privateKey,
      clientEmail: credentials.clientEmail
    },
    project: credentials.project,
    location: credentials.location
  } as VertexProvider
}
