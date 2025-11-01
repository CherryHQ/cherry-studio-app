import { File } from 'expo-file-system'
import { isEmpty } from 'lodash'

import {
  isFunctionCallingModel,
  isNotSupportTemperatureAndTopP,
  isOpenAIModel,
  isSupportFlexServiceTierModel
} from '@/config/models'
import { REFERENCE_PROMPT } from '@/config/prompts'
import { isSupportServiceTierProvider } from '@/config/providers'
import { defaultTimeout } from '@/constants'
import { getAssistantSettings } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import type { Assistant, Model, OpenAIVerbosity, Provider } from '@/types/assistant'
import {
  GroqServiceTiers,
  isGroqServiceTier,
  isOpenAIServiceTier,
  OpenAIServiceTiers,
  SystemProviderIds
} from '@/types/assistant'
import { FileTypes } from '@/types/file'
import type { GenerateImageParams } from '@/types/image'
import type { KnowledgeReference } from '@/types/knowledge'
import type { MCPCallToolResponse, MCPToolResponse, ToolCallResponse } from '@/types/mcp'
import type { Message } from '@/types/message'
import type {
  RequestOptions,
  SdkInstance,
  SdkMessageParam,
  SdkModel,
  SdkParams,
  SdkRawChunk,
  SdkRawOutput,
  SdkTool,
  SdkToolCall
} from '@/types/sdk'
import type { MCPTool } from '@/types/tool'
import type { WebSearchProviderResponse, WebSearchResponse } from '@/types/websearch'
import { storage } from '@/utils'
import { addAbortController, removeAbortController } from '@/utils/abortController'
import { isJSON, parseJSON } from '@/utils/json'
import { findFileBlocks, getMainTextContent } from '@/utils/messageUtils/find'

import type { CompletionsContext } from '../middleware/types'
import type { ApiClient, RequestTransformer, ResponseChunkTransformer } from './types'

const logger = loggerService.withContext('BaseApiClient')

/**
 * Abstract base class for API clients.
 * Provides common functionality and structure for specific client implementations.
 */
export abstract class BaseApiClient<
  TSdkInstance extends SdkInstance = SdkInstance,
  TSdkParams extends SdkParams = SdkParams,
  TRawOutput extends SdkRawOutput = SdkRawOutput,
  TRawChunk extends SdkRawChunk = SdkRawChunk,
  TMessageParam extends SdkMessageParam = SdkMessageParam,
  TToolCall extends SdkToolCall = SdkToolCall,
  TSdkSpecificTool extends SdkTool = SdkTool
> implements ApiClient<TSdkInstance, TSdkParams, TRawOutput, TRawChunk, TMessageParam, TToolCall, TSdkSpecificTool>
{
  public provider: Provider
  protected host: string
  protected apiKey: string
  protected sdkInstance?: TSdkInstance

  constructor(provider: Provider) {
    this.provider = provider
    this.host = this.getBaseURL()
    this.apiKey = this.getApiKey()
  }

  /**
   * 获取客户端的兼容性类型
   * 用于判断客户端是否支持特定功能，避免instanceof检查的类型收窄问题
   * 对于装饰器模式的客户端（如AihubmixAPIClient），应该返回其内部实际使用的客户端类型
   */

  public getClientCompatibilityType(_model?: Model): string[] {
    // 默认返回类的名称
    return [this.constructor.name]
  }

  // // 核心的completions方法 - 在中间件架构中，这通常只是一个占位符
  // abstract completions(params: CompletionsParams, internal?: ProcessingState): Promise<CompletionsResult>

  /**
   * 核心API Endpoint
   **/

  abstract createCompletions(payload: TSdkParams, options?: RequestOptions): Promise<TRawOutput>

  abstract generateImage(generateImageParams: GenerateImageParams): Promise<string[]>

  abstract getEmbeddingDimensions(model?: Model): Promise<number>

  abstract listModels(): Promise<SdkModel[]>

  abstract getSdkInstance(): Promise<TSdkInstance> | TSdkInstance

  /**
   * 中间件
   **/

  // 在 CoreRequestToSdkParamsMiddleware中使用
  abstract getRequestTransformer(): RequestTransformer<TSdkParams, TMessageParam>
  // 在RawSdkChunkToGenericChunkMiddleware中使用
  abstract getResponseChunkTransformer(ctx: CompletionsContext): ResponseChunkTransformer<TRawChunk>

  /**
   * 工具转换
   **/

  // Optional tool conversion methods - implement if needed by the specific provider
  abstract convertMcpToolsToSdkTools(mcpTools: MCPTool[]): TSdkSpecificTool[]

  abstract convertSdkToolCallToMcp(toolCall: TToolCall, mcpTools: MCPTool[]): MCPTool | undefined

  abstract convertSdkToolCallToMcpToolResponse(toolCall: TToolCall, mcpTool: MCPTool): ToolCallResponse

  abstract buildSdkMessages(
    currentReqMessages: TMessageParam[],
    output: TRawOutput | string | undefined,
    toolResults: TMessageParam[],
    toolCalls?: TToolCall[]
  ): TMessageParam[]

  abstract estimateMessageTokens(message: TMessageParam): number

  abstract convertMcpToolResponseToSdkMessageParam(
    mcpToolResponse: MCPToolResponse,
    resp: MCPCallToolResponse,
    model: Model
  ): TMessageParam | undefined

  /**
   * 从SDK载荷中提取消息数组（用于中间件中的类型安全访问）
   * 不同的提供商可能使用不同的字段名（如messages、history等）
   */
  abstract extractMessagesFromSdkPayload(sdkPayload: TSdkParams): TMessageParam[]

  /**
   * 通用函数
   **/

  public getBaseURL(): string {
    return this.provider.apiHost
  }

  public getApiKey() {
    const keys = this.provider.apiKey.split(',').map(key => key.trim())
    const keyName = `provider:${this.provider.id}:last_used_key`

    if (keys.length === 1) {
      return keys[0]
    }

    const lastUsedKey = storage.getString(keyName)

    if (!lastUsedKey) {
      storage.set(keyName, keys[0])
      return keys[0]
    }

    const currentIndex = keys.indexOf(lastUsedKey)
    const nextIndex = (currentIndex + 1) % keys.length
    const nextKey = keys[nextIndex]
    storage.set(keyName, nextKey)

    return nextKey
  }

  public defaultHeaders() {
    return {
      'HTTP-Referer': 'https://cherry-ai.com',
      'X-Title': 'Cherry Studio',
      'X-Api-Key': this.apiKey
    }
  }

  public get keepAliveTime() {
    // return this.provider.id === 'lmstudio' ? getLMStudioKeepAliveTime() : undefined
    return undefined
  }

  public getTemperature(assistant: Assistant, model: Model): number | undefined {
    if (isNotSupportTemperatureAndTopP(model)) {
      return undefined
    }

    const assistantSettings = getAssistantSettings(assistant)
    return assistantSettings?.enableTemperature ? assistantSettings?.temperature : undefined
  }

  public getTopP(assistant: Assistant, model: Model): number | undefined {
    if (isNotSupportTemperatureAndTopP(model)) {
      return undefined
    }

    const assistantSettings = getAssistantSettings(assistant)
    return assistantSettings?.enableTopP ? assistantSettings?.topP : undefined
  }

  // NOTE: 这个也许可以迁移到OpenAIBaseClient
  protected getServiceTier(model: Model) {
    const serviceTierSetting = this.provider.serviceTier

    if (!isSupportServiceTierProvider(this.provider) || !isOpenAIModel(model) || !serviceTierSetting) {
      return undefined
    }

    // 处理不同供应商需要 fallback 到默认值的情况
    if (this.provider.id === SystemProviderIds.groq) {
      if (
        !isGroqServiceTier(serviceTierSetting) ||
        (serviceTierSetting === GroqServiceTiers.flex && !isSupportFlexServiceTierModel(model))
      ) {
        return undefined
      }
    } else {
      // 其他 OpenAI 供应商，假设他们的服务层级设置和 OpenAI 完全相同
      if (
        !isOpenAIServiceTier(serviceTierSetting) ||
        (serviceTierSetting === OpenAIServiceTiers.flex && !isSupportFlexServiceTierModel(model))
      ) {
        return undefined
      }
    }

    return serviceTierSetting
  }

  protected getVerbosity(): OpenAIVerbosity {
    try {
      // const state = window.store?.getState()
      // const verbosity = state?.settings?.openAI?.verbosity
      const verbosity = 'medium'

      if (verbosity && ['low', 'medium', 'high'].includes(verbosity)) {
        return verbosity
      }
    } catch (error) {
      logger.warn('Failed to get verbosity from state:', error as Error)
    }

    return 'medium'
  }

  protected getTimeout(model: Model) {
    if (isSupportFlexServiceTierModel(model)) {
      return 15 * 1000 * 60
    }

    return defaultTimeout
  }

  public async getMessageContent(
    message: Message
  ): Promise<{ textContent: string; imageContents: { fileId: string; fileExt: string }[] }> {
    const content = await getMainTextContent(message)

    if (isEmpty(content)) {
      return {
        textContent: '',
        imageContents: []
      }
    }

    const webSearchReferences = await this.getWebSearchReferencesFromCache(message)

    const allReferences = [...webSearchReferences]

    logger.debug(`Found ${allReferences.length} references for ID: ${message.id}`, allReferences)

    const referenceContent = `\`\`\`json\n${JSON.stringify(allReferences, null, 2)}\n\`\`\``

    return {
      textContent: isEmpty(allReferences)
        ? content
        : REFERENCE_PROMPT.replace('{question}', content).replace('{references}', referenceContent),
      imageContents: []
    }
  }

  /**
   * Extract the file content from the message
   * @param message - The message
   * @returns The file content
   */
  protected async extractFileContent(message: Message) {
    const fileBlocks = await findFileBlocks(message)

    if (fileBlocks.length > 0) {
      const textFileBlocks = fileBlocks.filter(
        fb => fb.file && [FileTypes.TEXT, FileTypes.DOCUMENT].includes(fb.file.type)
      )

      if (textFileBlocks.length > 0) {
        let text = ''
        const divider = '\n\n---\n\n'

        for (const fileBlock of textFileBlocks) {
          const file = fileBlock.file
          const fileContent = new File(file.path).textSync().trim()
          const fileNameRow = 'file: ' + file.origin_name + '\n\n'
          text = text + fileNameRow + fileContent + divider
        }

        return text
      }
    }

    return ''
  }

  private async getWebSearchReferencesFromCache(message: Message) {
    const content = getMainTextContent(message)

    if (isEmpty(content)) {
      return []
    }

    // might parse error
    const webSearch: WebSearchResponse = JSON.parse(storage.getString(`web-search-${message.id}`) || '')

    if (webSearch) {
      storage.delete(`web-search-${message.id}`)
      return (webSearch.results as WebSearchProviderResponse).results.map(
        (result, index) =>
          ({
            id: index + 1,
            content: result.content,
            sourceUrl: result.url,
            type: 'url'
          }) as KnowledgeReference
      )
    }

    return []
  }

  protected getCustomParameters(assistant: Assistant) {
    return (
      assistant?.settings?.customParameters?.reduce((acc, param) => {
        if (!param.name?.trim()) {
          return acc
        }

        if (param.type === 'json') {
          const value = param.value as string

          if (value === 'undefined') {
            return { ...acc, [param.name]: undefined }
          }

          return { ...acc, [param.name]: isJSON(value) ? parseJSON(value) : value }
        }

        return {
          ...acc,
          [param.name]: param.value
        }
      }, {}) || {}
    )
  }

  public createAbortController(messageId?: string, isAddEventListener?: boolean) {
    const abortController = new AbortController()
    const abortFn = () => abortController.abort()

    if (messageId) {
      addAbortController(messageId, abortFn)
    }

    const cleanup = () => {
      if (messageId) {
        signalPromise.resolve?.(undefined)
        removeAbortController(messageId, abortFn)
      }
    }

    const signalPromise: {
      resolve: (value: unknown) => void
      promise: Promise<unknown>
    } = {
      resolve: () => {},
      promise: Promise.resolve()
    }

    if (isAddEventListener) {
      signalPromise.promise = new Promise((resolve, reject) => {
        signalPromise.resolve = resolve

        if (abortController.signal.aborted) {
          reject(new Error('Request was aborted.'))
        }

        // 捕获abort事件,有些abort事件必须
        abortController.signal.addEventListener('abort', () => {
          reject(new Error('Request was aborted.'))
        })
      })
      return {
        abortController,
        cleanup,
        signalPromise
      }
    }

    return {
      abortController,
      cleanup
    }
  }

  // Setup tools configuration based on provided parameters
  public setupToolsConfig(params: { mcpTools?: MCPTool[]; model: Model; enableToolUse?: boolean }): {
    tools: TSdkSpecificTool[]
  } {
    const { mcpTools, model, enableToolUse } = params
    let tools: TSdkSpecificTool[] = []

    // If there are no tools, return an empty array
    if (!mcpTools?.length) {
      return { tools }
    }

    // If the model supports function calling and tool usage is enabled
    if (isFunctionCallingModel(model) && enableToolUse) {
      tools = this.convertMcpToolsToSdkTools(mcpTools)
    }

    return { tools }
  }
}
