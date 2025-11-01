import { loggerService } from '@/services/LoggerService'
import type { Provider } from '@/types/assistant'

import { AihubmixAPIClient } from './aihubmix/AihubmixAPIClient'
import { AnthropicAPIClient } from './anthropic/AnthropicAPIClient'
import type { BaseApiClient } from './BaseApiClient'
import { CherryinAPIClient } from './cherryai/CherryaiAPIClient'
import { GeminiAPIClient } from './gemini/GeminiAPIClient'
import { NewAPIClient } from './newapi/NewAPIClient'
import { OpenAIAPIClient } from './openai/OpenAIApiClient'
import { OpenAIResponseAPIClient } from './openai/OpenAIResponseAPIClient'
import { PPIOAPIClient } from './ppio/PPIOAPIClient'
import { ZhipuAPIClient } from './zhipu/ZhipuAPIClient'

const logger = loggerService.withContext('ApiClientFactory')

/**
 * Factory for creating ApiClient instances based on provider configuration
 * 根据提供者配置创建ApiClient实例的工厂
 */
export class ApiClientFactory {
  /**
   * Create an ApiClient instance for the given provider
   * 为给定的提供者创建ApiClient实例
   */
  static create(provider: Provider): BaseApiClient {
    logger.debug(`Creating ApiClient for provider:`, {
      id: provider.id,
      type: provider.type
    })

    let instance: BaseApiClient

    // 首先检查特殊的 Provider ID
    if (provider.id === 'cherryai') {
      instance = new CherryinAPIClient(provider) as BaseApiClient
      return instance
    }

    if (provider.id === 'aihubmix') {
      logger.debug(`Creating AihubmixAPIClient for provider: ${provider.id}`)
      instance = new AihubmixAPIClient(provider) as BaseApiClient
      return instance
    }

    if (provider.id === 'new-api') {
      logger.debug(`Creating NewAPIClient for provider: ${provider.id}`)
      instance = new NewAPIClient(provider) as BaseApiClient
      return instance
    }

    if (provider.id === 'ppio') {
      logger.debug(`Creating PPIOAPIClient for provider: ${provider.id}`)
      instance = new PPIOAPIClient(provider) as BaseApiClient
      return instance
    }

    if (provider.id === 'zhipu') {
      instance = new ZhipuAPIClient(provider) as BaseApiClient
      return instance
    }

    // 然后检查标准的 Provider Type
    switch (provider.type) {
      case 'openai':
        instance = new OpenAIAPIClient(provider) as BaseApiClient
        break
      case 'azure-openai':
      case 'openai-response':
        instance = new OpenAIResponseAPIClient(provider) as BaseApiClient
        break
      case 'gemini':
        instance = new GeminiAPIClient(provider) as BaseApiClient
        break
      case 'vertexai':
        throw new Error('Vertex AI API Client is not implemented yet')
      case 'anthropic':
        instance = new AnthropicAPIClient(provider) as BaseApiClient
        break
      case 'aws-bedrock':
        throw new Error('AWS Bedrock API Client is not implemented yet')
      default:
        logger.debug(`Using default OpenAIApiClient for provider: ${provider.id}`)
        instance = new OpenAIAPIClient(provider) as BaseApiClient
        break
    }

    return instance
  }
}
