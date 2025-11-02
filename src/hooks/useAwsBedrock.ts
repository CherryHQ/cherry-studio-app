import * as SecureStore from 'expo-secure-store'

import { loggerService } from '@/services/LoggerService'
import type { Provider } from '@/types/assistant'

const logger = loggerService.withContext('useAwsBedrock')

const AWS_BEDROCK_KEYS = {
  ACCESS_KEY_ID: 'aws_bedrock_access_key_id',
  SECRET_ACCESS_KEY: 'aws_bedrock_secret_access_key',
  REGION: 'aws_bedrock_region'
} as const

/**
 * Check if provider is AWS Bedrock
 */
export function isAwsBedrockProvider(provider: Provider): boolean {
  return provider.type === 'aws-bedrock'
}

/**
 * Get AWS Bedrock Access Key ID
 */
export async function getAwsBedrockAccessKeyId(providerId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${providerId}`)
  } catch (error) {
    logger.error('Failed to get AWS Access Key ID:', error as Error)
    return null
  }
}

/**
 * Get AWS Bedrock Secret Access Key
 */
export async function getAwsBedrockSecretAccessKey(providerId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${providerId}`)
  } catch (error) {
    logger.error('Failed to get AWS Secret Access Key:', error as Error)
    return null
  }
}

/**
 * Get AWS Bedrock Region
 */
export async function getAwsBedrockRegion(providerId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`${AWS_BEDROCK_KEYS.REGION}_${providerId}`)
  } catch (error) {
    logger.error('Failed to get AWS Region:', error as Error)
    return null
  }
}

/**
 * Save AWS Bedrock credentials securely
 */
export async function saveAwsBedrockCredentials(
  providerId: string,
  credentials: {
    accessKeyId: string
    secretAccessKey: string
    region: string
  }
): Promise<void> {
  try {
    await Promise.all([
      SecureStore.setItemAsync(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${providerId}`, credentials.accessKeyId),
      SecureStore.setItemAsync(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${providerId}`, credentials.secretAccessKey),
      SecureStore.setItemAsync(`${AWS_BEDROCK_KEYS.REGION}_${providerId}`, credentials.region)
    ])
    logger.info(`AWS Bedrock credentials saved for provider: ${providerId}`)
  } catch (error) {
    logger.error('Failed to save AWS Bedrock credentials:', error as Error)
    throw error
  }
}

/**
 * Delete AWS Bedrock credentials
 */
export async function deleteAwsBedrockCredentials(providerId: string): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${providerId}`),
      SecureStore.deleteItemAsync(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${providerId}`),
      SecureStore.deleteItemAsync(`${AWS_BEDROCK_KEYS.REGION}_${providerId}`)
    ])
    logger.info(`AWS Bedrock credentials deleted for provider: ${providerId}`)
  } catch (error) {
    logger.error('Failed to delete AWS Bedrock credentials:', error as Error)
    throw error
  }
}

/**
 * Check if AWS Bedrock is properly configured
 */
export async function isAwsBedrockConfigured(providerId: string): Promise<boolean> {
  try {
    const [accessKeyId, secretAccessKey, region] = await Promise.all([
      getAwsBedrockAccessKeyId(providerId),
      getAwsBedrockSecretAccessKey(providerId),
      getAwsBedrockRegion(providerId)
    ])

    return !!(accessKeyId && secretAccessKey && region)
  } catch (error) {
    logger.error('Failed to check AWS Bedrock configuration:', error as Error)
    return false
  }
}

/**
 * Get all AWS Bedrock credentials
 */
export async function getAwsBedrockCredentials(
  providerId: string
): Promise<{ accessKeyId: string; secretAccessKey: string; region: string } | null> {
  try {
    const [accessKeyId, secretAccessKey, region] = await Promise.all([
      getAwsBedrockAccessKeyId(providerId),
      getAwsBedrockSecretAccessKey(providerId),
      getAwsBedrockRegion(providerId)
    ])

    if (!accessKeyId || !secretAccessKey || !region) {
      return null
    }

    return { accessKeyId, secretAccessKey, region }
  } catch (error) {
    logger.error('Failed to get AWS Bedrock credentials:', error as Error)
    return null
  }
}
