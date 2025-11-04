import { isVertexProvider } from '@/config/providers'
import { type Provider, type VertexProvider } from '@/types/assistant'

export interface VertexAICredentials {
  privateKey: string
  clientEmail: string
  project: string
  location: string
}

/**
 * Vertex AI Service
 *
 * NOTE: This service no longer directly accesses SecureStore.
 * Use the useVertexAICredentials hook in React components to manage credentials.
 *
 * This service only provides business logic for working with Vertex AI providers.
 */
class VertexAIService {
  private static instance: VertexAIService

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): VertexAIService {
    if (!VertexAIService.instance) {
      VertexAIService.instance = new VertexAIService()
    }
    return VertexAIService.instance
  }

  /**
   * Check if VertexAI has all required configuration
   */
  isVertexAIConfigured(provider: Provider, credentials: VertexAICredentials | null): boolean {
    if (!isVertexProvider(provider)) return false
    if (!credentials) return false
    return !!(credentials.privateKey && credentials.clientEmail && credentials.project && credentials.location)
  }

  /**
   * Create a VertexAI provider with credentials
   */
  createVertexProvider(provider: Provider, credentials: VertexAICredentials | null): VertexProvider | Provider {
    if (!isVertexProvider(provider)) {
      return provider
    }

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
}

// Export singleton instance
export default VertexAIService.getInstance()
