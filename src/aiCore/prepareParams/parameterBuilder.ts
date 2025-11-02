/**
 * 参数构建模块
 * 构建AI SDK的流式和非流式参数
 */

import type { ModelMessage } from 'ai'
import { stepCountIs } from 'ai'

import {
  isGenerateImageModel,
  isOpenRouterBuiltInWebSearchModel,
  isReasoningModel,
  isSupportedReasoningEffortModel,
  isSupportedThinkingTokenModel,
  isWebSearchModel
} from '@/config/models'
import { getAssistantSettings, getDefaultModel } from '@/services/AssistantService'
import type { StreamTextParams } from '@/types/aiCoretypes'
import type { Assistant, Provider } from '@/types/assistant'
import type { MCPTool } from '@/types/tool'

import { setupToolsConfig } from '../utils/mcp'
import { buildProviderOptions } from '../utils/options'
import { getTemperature, getTopP } from './modelParameters'

/**
 * 构建 AI SDK 流式参数
 * 这是主要的参数构建函数，整合所有转换逻辑
 */
export async function buildStreamTextParams(
  sdkMessages: StreamTextParams['messages'] = [],
  assistant: Assistant,
  provider: Provider,
  options: {
    mcpTools?: MCPTool[]
    webSearchProviderId?: string
    requestOptions?: {
      signal?: AbortSignal
      timeout?: number
      headers?: Record<string, string>
    }
  } = {}
): Promise<{
  params: StreamTextParams
  modelId: string
  capabilities: {
    enableReasoning: boolean
    enableWebSearch: boolean
    enableGenerateImage: boolean
    enableUrlContext: boolean
  }
}> {
  const { mcpTools } = options

  const model = assistant.model || getDefaultModel()

  const { maxTokens } = getAssistantSettings(assistant)

  // 这三个变量透传出来，交给下面启用插件/中间件
  // 也可以在外部构建好再传入buildStreamTextParams
  // FIXME: qwen3即使关闭思考仍然会导致enableReasoning的结果为true
  const enableReasoning =
    ((isSupportedThinkingTokenModel(model) || isSupportedReasoningEffortModel(model)) &&
      assistant.settings?.reasoning_effort !== undefined) ||
    (isReasoningModel(model) && (!isSupportedThinkingTokenModel(model) || !isSupportedReasoningEffortModel(model)))

  // 判断是否使用内置搜索
  // 条件：没有外部搜索提供商 && (用户开启了内置搜索 || 模型强制使用内置搜索)
  // 如果用户指定了搜索提供商，则使用用户指定的搜索提供商
  const enableWebSearch =
    options.webSearchProviderId === 'builtin'
      ? (assistant.enableWebSearch && isWebSearchModel(model)) ||
        isOpenRouterBuiltInWebSearchModel(model) ||
        model.id.includes('sonar')
      : !!options.webSearchProviderId

  console.log('enableWebSearch', options, enableWebSearch)

  const enableUrlContext = assistant.enableUrlContext || false

  const enableGenerateImage = !!(isGenerateImageModel(model) && assistant.enableGenerateImage)

  let tools = setupToolsConfig(mcpTools)

  // if (webSearchProviderId) {
  //   tools['builtin_web_search'] = webSearchTool(webSearchProviderId)
  // }

  // 构建真正的 providerOptions
  const providerOptions = buildProviderOptions(assistant, model, provider, {
    enableReasoning,
    enableWebSearch,
    enableGenerateImage
  })

  // 构建基础参数
  const params: StreamTextParams = {
    messages: sdkMessages,
    maxOutputTokens: maxTokens,
    temperature: getTemperature(assistant, model),
    topP: getTopP(assistant, model),
    abortSignal: options.requestOptions?.signal,
    headers: options.requestOptions?.headers,
    providerOptions,
    tools,
    stopWhen: stepCountIs(10),
    maxRetries: 0
  }

  if (tools && Object.keys(tools).length > 0) {
    params.tools = tools
  }

  if (assistant.prompt) {
    params.system = assistant.prompt
  }

  return {
    params,
    modelId: model.id,
    capabilities: { enableReasoning, enableWebSearch, enableGenerateImage, enableUrlContext }
  }
}

/**
 * 构建非流式的 generateText 参数
 */
export async function buildGenerateTextParams(
  messages: ModelMessage[],
  assistant: Assistant,
  provider: Provider,
  options: {
    mcpTools?: MCPTool[]
    enableTools?: boolean
  } = {}
): Promise<any> {
  // 复用流式参数的构建逻辑
  return await buildStreamTextParams(messages, assistant, provider, options)
}
