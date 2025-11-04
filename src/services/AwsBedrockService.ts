export const AWS_BEDROCK_KEYS = {
  ACCESS_KEY_ID: 'aws_bedrock_access_key_id',
  SECRET_ACCESS_KEY: 'aws_bedrock_secret_access_key',
  REGION: 'aws_bedrock_region'
} as const

export interface AwsBedrockCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

/**
 * AWS Bedrock Service
 *
 * NOTE: This service no longer directly accesses SecureStore.
 * Use the useAwsBedrockCredentials hook in React components to manage credentials.
 *
 * This service only provides business logic for validating and working with credentials.
 */
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
   * Validate AWS Bedrock credentials
   */
  validateCredentials(credentials: Partial<AwsBedrockCredentials>): boolean {
    return !!(credentials.accessKeyId && credentials.secretAccessKey && credentials.region)
  }

  /**
   * Check if credentials are complete
   */
  isConfigured(credentials: Partial<AwsBedrockCredentials> | null): boolean {
    if (!credentials) return false
    return this.validateCredentials(credentials)
  }
}

// Export singleton instance
export default AwsBedrockService.getInstance()
