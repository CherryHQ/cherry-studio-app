/**
 * Cherry Studio AI Core - 新版本入口
 * 集成 @cherrystudio/ai-core 库的渐进式重构方案
 *
 * 融合方案：简化实现，专注于核心功能
 * 1. 优先使用新AI SDK
 * 2. 失败时fallback到原有实现
 * 3. 暂时保持接口兼容性
 */
import {
  AiCore,
  AiPlugin,
  createExecutor,
  ProviderConfigFactory,
  type ProviderId,
  type ProviderSettingsMap,
  StreamTextParams
} from '@cherrystudio/ai-core'
import { createPromptToolUsePlugin, webSearchPlugin } from '@cherrystudio/ai-core/built-in/plugins'
import { fetch as expoFetch } from 'expo/fetch'
import { cloneDeep } from 'lodash'

import { isDedicatedImageGenerationModel } from '@/config/models/image'
import { loggerService } from '@/services/LoggerService'
import { Model, Provider } from '@/types/assistant'
import { GenerateImageParams } from '@/types/image'
import { formatApiHost } from '@/utils/api'

import LegacyAiProvider from '.'
import AiSdkToChunkAdapter from './chunk/AiSdkToChunkAdapter'
import { AiSdkMiddlewareConfig, buildAiSdkMiddlewares } from './middleware/aisdk/AiSdkMiddlewareBuilder'
import { CompletionsResult } from './middleware/schemas'
import reasoningTimePlugin from './plugins/reasoningTimePlugin'
import { createAihubmixProvider } from './provider/aihubmix'
import { getAiSdkProviderId } from './provider/factory'

const logger = loggerService.withContext('ToolCallChunkHandler')

function getActualProvider(model: Model, provider: Provider): Provider {
  // 如果是 vertexai 类型且没有 googleCredentials，转换为 VertexProvider
  let actualProvider = cloneDeep(provider)

  if (provider.id === 'aihubmix') {
    actualProvider = createAihubmixProvider(model, actualProvider)
  }

  if (actualProvider.type === 'gemini') {
    actualProvider.apiHost = formatApiHost(actualProvider.apiHost, 'v1beta')
  } else {
    actualProvider.apiHost = formatApiHost(actualProvider.apiHost)
  }

  return actualProvider
}

/**
 * 将 Provider 配置转换为新 AI SDK 格式
 */
function providerToAiSdkConfig(actualProvider: Provider): {
  providerId: ProviderId | 'openai-compatible'
  options: ProviderSettingsMap[keyof ProviderSettingsMap]
} {
  const aiSdkProviderId = getAiSdkProviderId(actualProvider)

  // 如果provider是openai，则使用strict模式并且默认responses api
  const openaiResponseOptions =
    aiSdkProviderId === 'openai'
      ? {
          compatibility: 'strict'
        }
      : undefined

  if (AiCore.isSupported(aiSdkProviderId) && aiSdkProviderId !== 'openai-compatible') {
    const options = ProviderConfigFactory.fromProvider(
      aiSdkProviderId,
      {
        baseURL: actualProvider.apiHost,
        apiKey: actualProvider.apiKey,
        headers: actualProvider.extra_headers
      },
      openaiResponseOptions
    )

    return {
      providerId: aiSdkProviderId as ProviderId,
      options
    }
  } else {
    logger.info(`Using openai-compatible fallback for provider: ${actualProvider.type}`)
    const options = ProviderConfigFactory.createOpenAICompatible(actualProvider.apiHost, actualProvider.apiKey)

    return {
      providerId: 'openai-compatible',
      options: {
        ...options,
        name: actualProvider.id
      }
    }
  }
}

/**
 * 检查是否支持使用新的AI SDK
 */
function isModernSdkSupported(provider: Provider, model?: Model): boolean {
  // 目前支持主要的providers
  const supportedProviders = ['openai', 'anthropic', 'gemini', 'azure-openai']

  // 检查provider类型
  if (!supportedProviders.includes(provider.type)) {
    return false
  }

  // 检查是否为图像生成模型（暂时不支持）
  if (model && isDedicatedImageGenerationModel(model)) {
    return false
  }

  return true
}

export default class ModernAiProvider {
  private legacyProvider: LegacyAiProvider
  private config: ReturnType<typeof providerToAiSdkConfig>
  private actualProvider: Provider

  constructor(model: Model, provider: Provider) {
    this.actualProvider = getActualProvider(model, provider)

    this.legacyProvider = new LegacyAiProvider(provider)

    const customFetch = async (url, options) => {
      const response = await expoFetch(url, {
        ...options,
        headers: {
          ...options.headers
        }
      })
      return response
    }

    // TODO:如果后续在调用completions时需要切换provider的话,
    // 初始化时不构建中间件，等到需要时再构建
    this.config = providerToAiSdkConfig(this.actualProvider)
    this.config.options.fetch = customFetch
  }

  public getActualProvider() {
    return this.actualProvider
  }

  /**
   * 根据条件构建插件数组
   */
  private buildPlugins(middlewareConfig: AiSdkMiddlewareConfig) {
    const plugins: AiPlugin[] = []

    // 1. 总是添加通用插件
    // plugins.push(textPlugin)
    if (middlewareConfig.enableWebSearch) {
      // 内置了默认搜索参数，如果改的话可以传config进去
      plugins.push(webSearchPlugin())
    }

    // 2. 推理模型时添加推理插件
    if (middlewareConfig.enableReasoning) {
      logger.info('buildPlugins', middlewareConfig.enableReasoning)
      plugins.push(reasoningTimePlugin)
    }

    // 3. 启用Prompt工具调用时添加工具插件
    if (middlewareConfig.enableTool && middlewareConfig.mcpTools && middlewareConfig.mcpTools.length > 0) {
      plugins.push(
        createPromptToolUsePlugin({
          enabled: true,
          createSystemMessage: (systemPrompt, params, context) => {
            if (context.modelId.includes('o1-mini') || context.modelId.includes('o1-preview')) {
              if (context.isRecursiveCall) {
                return null
              }

              params.messages = [
                {
                  role: 'assistant',
                  content: systemPrompt
                },
                ...params.messages
              ]
              return null
            }

            return systemPrompt
          }
        })
      )
    }

    // if (!middlewareConfig.enableTool && middlewareConfig.mcpTools && middlewareConfig.mcpTools.length > 0) {
    //   plugins.push(createNativeToolUsePlugin())
    // }
    logger.info(
      '最终插件列表:',
      plugins.map(p => p.name)
    )
    return plugins
  }

  public async completions(
    modelId: string,
    params: StreamTextParams,
    middlewareConfig: AiSdkMiddlewareConfig
  ): Promise<CompletionsResult> {
    logger.info('completions', modelId, params, middlewareConfig)
    return await this.modernCompletions(modelId, params, middlewareConfig)
  }

  /**
   * 使用现代化AI SDK的completions实现
   */
  private async modernCompletions(
    modelId: string,
    params: StreamTextParams,
    middlewareConfig: AiSdkMiddlewareConfig
  ): Promise<CompletionsResult> {
    // try {
    // 根据条件构建插件数组
    const plugins = this.buildPlugins(middlewareConfig)
    logger.info('this.config.providerId', this.config.providerId)
    logger.info('this.config.options', this.config.options)
    logger.info('plugins', plugins)
    // 用构建好的插件数组创建executor
    const executor = createExecutor(this.config.providerId, this.config.options, plugins)

    // 动态构建中间件数组
    const middlewares = buildAiSdkMiddlewares(middlewareConfig)
    // logger.info('构建的中间件:', middlewares)

    // 创建带有中间件的执行器
    if (middlewareConfig.onChunk) {
      // 流式处理 - 使用适配器
      const adapter = new AiSdkToChunkAdapter(middlewareConfig.onChunk, middlewareConfig.mcpTools)
      logger.info('最终params', params)
      const streamResult = await executor.streamText(
        modelId,
        params,
        middlewares.length > 0 ? { middlewares } : undefined
      )

      const finalText = await adapter.processStream(streamResult)

      return {
        getText: () => finalText
      }
    } else {
      // 流式处理但没有 onChunk 回调
      const streamResult = await executor.streamText(
        modelId,
        params,
        middlewares.length > 0 ? { middlewares } : undefined
      )
      const finalText = await streamResult.text

      return {
        getText: () => finalText
      }
    }
    // }
    // catch (error) {
    //   console.error('Modern AI SDK error:', error)
    //   throw error
    // }
  }

  // 代理其他方法到原有实现
  public async models() {
    return this.legacyProvider.models()
  }

  public async getEmbeddingDimensions(model: Model): Promise<number> {
    return this.legacyProvider.getEmbeddingDimensions(model)
  }

  public async generateImage(params: GenerateImageParams): Promise<string[]> {
    return this.legacyProvider.generateImage(params)
  }

  public getBaseURL(): string {
    return this.legacyProvider.getBaseURL()
  }

  public getApiKey(): string {
    return this.legacyProvider.getApiKey()
  }
}

// 为了方便调试，导出一些工具函数
export { isModernSdkSupported, providerToAiSdkConfig }
