import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('AwsBedrockService')

const AWS_BEDROCK_KEYS = {
  ACCESS_KEY_ID: 'aws_bedrock_access_key_id',
  SECRET_ACCESS_KEY: 'aws_bedrock_secret_access_key',
  REGION: 'aws_bedrock_region'
} as const

// Lazy import SecureStore to avoid early native module access during app initialization
let SecureStore: typeof import('expo-secure-store') | null = null
const getSecureStore = async () => {
  if (!SecureStore) {
    SecureStore = await import('expo-secure-store')
  }
  return SecureStore
}

class AwsBedrockService {
  private static instance: AwsBedrockService

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): AwsBedrockService {
    if (!AwsBedrockService.instance) {
      AwsBedrockService.instance = new AwsBedrockService()
    }
    return AwsBedrockService.instance
  }
  /**
   * Get AWS Bedrock Access Key ID
   */
  async getAwsBedrockAccessKeyId(providerId: string): Promise<string | null> {
    try {
      const store = await getSecureStore()
      return await store.getItemAsync(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${providerId}`)
    } catch (error) {
      logger.error('Failed to get AWS Access Key ID:', error as Error)
      return null
    }
  }

  /**
   * Get AWS Bedrock Secret Access Key
   */
  async getAwsBedrockSecretAccessKey(providerId: string): Promise<string | null> {
    try {
      const store = await getSecureStore()
      return await store.getItemAsync(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${providerId}`)
    } catch (error) {
      logger.error('Failed to get AWS Secret Access Key:', error as Error)
      return null
    }
  }

  /**
   * Get AWS Bedrock Region
   */
  async getAwsBedrockRegion(providerId: string): Promise<string | null> {
    try {
      const store = await getSecureStore()
      return await store.getItemAsync(`${AWS_BEDROCK_KEYS.REGION}_${providerId}`)
    } catch (error) {
      logger.error('Failed to get AWS Region:', error as Error)
      return null
    }
  }

  /**
   * Save AWS Bedrock credentials securely
   */
  async saveAwsBedrockCredentials(
    providerId: string,
    credentials: {
      accessKeyId: string
      secretAccessKey: string
      region: string
    }
  ): Promise<void> {
    try {
      const store = await getSecureStore()
      await Promise.all([
        store.setItemAsync(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${providerId}`, credentials.accessKeyId),
        store.setItemAsync(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${providerId}`, credentials.secretAccessKey),
        store.setItemAsync(`${AWS_BEDROCK_KEYS.REGION}_${providerId}`, credentials.region)
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
  async deleteAwsBedrockCredentials(providerId: string): Promise<void> {
    try {
      const store = await getSecureStore()
      await Promise.all([
        store.deleteItemAsync(`${AWS_BEDROCK_KEYS.ACCESS_KEY_ID}_${providerId}`),
        store.deleteItemAsync(`${AWS_BEDROCK_KEYS.SECRET_ACCESS_KEY}_${providerId}`),
        store.deleteItemAsync(`${AWS_BEDROCK_KEYS.REGION}_${providerId}`)
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
  async isAwsBedrockConfigured(providerId: string): Promise<boolean> {
    try {
      const [accessKeyId, secretAccessKey, region] = await Promise.all([
        this.getAwsBedrockAccessKeyId(providerId),
        this.getAwsBedrockSecretAccessKey(providerId),
        this.getAwsBedrockRegion(providerId)
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
  async getAwsBedrockCredentials(
    providerId: string
  ): Promise<{ accessKeyId: string; secretAccessKey: string; region: string } | null> {
    try {
      const [accessKeyId, secretAccessKey, region] = await Promise.all([
        this.getAwsBedrockAccessKeyId(providerId),
        this.getAwsBedrockSecretAccessKey(providerId),
        this.getAwsBedrockRegion(providerId)
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
}

// Export singleton instance
export default AwsBedrockService.getInstance()
