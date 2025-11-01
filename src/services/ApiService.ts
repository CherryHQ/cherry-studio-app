import { t } from 'i18next'
import { isEmpty, takeRight } from 'lodash'

import LegacyAiProvider from '@/aiCore'

import { CompletionsParams } from '@/aiCore/legacy/middleware/schemas'
import { AiSdkMiddlewareConfig } from '@/aiCore/middleware/AiSdkMiddlewareBuilder'
import { buildStreamTextParams, convertMessagesToSdkMessages } from '@/aiCore/prepareParams'
import { isDedicatedImageGenerationModel, isEmbeddingModel } from '@/config/models'
import i18n from '@/i18n'
import { loggerService } from '@/services/LoggerService'
import { Assistant, FetchChatCompletionParams, Model, Provider } from '@/types/assistant'
import { ChunkType } from '@/types/chunk'
import { SdkModel } from '@/types/sdk'
import { MCPTool } from '@/types/tool'
import { isPromptToolUse, isSupportedToolUse } from '@/utils/mcpTool'
import { filterMainTextMessages } from '@/utils/messageUtils/filters'

import AiProviderNew from '../aiCore/index_new'
import { getDefaultModel, assistantService } from './AssistantService'
import { getAssistantProvider } from './ProviderService'
import { createStreamProcessor, StreamProcessorCallbacks } from './StreamProcessingService'
import { mcpService } from './McpService'
import { topicService } from './TopicService'
import { MCPServer } from '@/types/mcp'
import { messageDatabase } from '@database'

const logger = loggerService.withContext('fetchChatCompletion')

export async function fetchChatCompletion({
  messages,
  prompt,
  assistant,
  options,
  onChunkReceived,
  topicId,
  uiMessages
}: FetchChatCompletionParams) {
  const AI = new AiProviderNew(assistant.model || getDefaultModel())
  const provider = AI.getActualProvider()

  const mcpTools: MCPTool[] = []

  onChunkReceived({ type: ChunkType.LLM_RESPONSE_CREATED })

  if (isPromptToolUse(assistant) || isSupportedToolUse(assistant)) {
    mcpTools.push(...(await fetchAssistantMcpTools(assistant)))
  }

  if (prompt) {
    messages = [
      {
        role: 'user',
        content: prompt
      }
    ]
  }

  // 使用 transformParameters 模块构建参数
  const {
    params: aiSdkParams,
    modelId,
    capabilities
  } = await buildStreamTextParams(messages, assistant, provider, {
    mcpTools: mcpTools,
    webSearchProviderId: assistant.webSearchProviderId,
    requestOptions: options
  })

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: assistant.settings?.streamOutput ?? true,
    onChunk: onChunkReceived,
    model: assistant.model,
    enableReasoning: capabilities.enableReasoning,
    isPromptToolUse: isPromptToolUse(assistant),
    isSupportedToolUse: isSupportedToolUse(assistant),
    isImageGenerationEndpoint: isDedicatedImageGenerationModel(assistant.model || getDefaultModel()),
    enableWebSearch: capabilities.enableWebSearch,
    enableGenerateImage: capabilities.enableGenerateImage,
    enableUrlContext: capabilities.enableUrlContext,
    mcpTools,
    uiMessages
  }

  // --- Call AI Completions ---
  await AI.completions(modelId, aiSdkParams, {
    ...middlewareConfig,
    assistant,
    topicId,
    callType: 'chat',
    uiMessages
  })
}

export async function fetchModels(provider: Provider): Promise<SdkModel[]> {
  const AI = new AiProviderNew(provider)

  try {
    return await AI.models()
  } catch (error) {
    logger.error('fetchChatCompletion', error as Error)
    return []
  }
}

export function checkApiProvider(provider: Provider): void {
  if (
    provider.id !== 'ollama' &&
    provider.id !== 'lmstudio' &&
    provider.type !== 'vertexai' &&
    provider.id !== 'copilot'
  ) {
    if (!provider.apiKey) {
      throw new Error(i18n.t('message.error.enter.api.key'))
    }
  }

  if (!provider.apiHost && provider.type !== 'vertexai') {
    throw new Error(i18n.t('message.error.enter.api.host'))
  }

  if (isEmpty(provider.models)) {
    throw new Error(i18n.t('message.error.enter.model'))
  }
}

export async function checkApi(provider: Provider, model: Model): Promise<void> {
  checkApiProvider(provider)

  const ai = new LegacyAiProvider(provider)

  const assistant: Assistant = {
    id: 'checkApi',
    name: 'Check Api Assistant',
    prompt: '',
    topics: [],
    type: 'external',
    model: model
  }

  try {
    if (isEmbeddingModel(model)) {
      await ai.getEmbeddingDimensions(model)
    } else {
      const params: CompletionsParams = {
        callType: 'check',
        messages: 'hi',
        assistant,
        streamOutput: false,
        shouldThrow: true
      }

      // Try streaming check first
      const result = await ai.completions(params)

      if (!result.getText()) {
        throw new Error('No response received')
      }
    }
  } catch (error: any) {
    logger.error('Check Api Error', error)
    throw error
  }
}

export async function fetchTopicNaming(topicId: string, regenerate: boolean = false) {
  logger.info('Fetching topic naming...')
  const topic = await topicService.getTopic(topicId)
  const messages = await messageDatabase.getMessagesByTopicId(topicId)

  if (!topic) {
    logger.error(`[fetchTopicNaming] Topic with ID ${topicId} not found.`)
    return
  }

  if (topic.name !== t('topics.new_topic') && !regenerate) {
    return
  }

  let callbacks: StreamProcessorCallbacks = {}

  callbacks = {
    onTextComplete: async finalText => {
      await topicService.updateTopic(topicId, { name: finalText.trim() })
    }
  }
  const streamProcessorCallbacks = createStreamProcessor(callbacks)
  const quickAssistant = await assistantService.getAssistant('quick')

  if (!quickAssistant?.defaultModel) {
    return
  }

  const provider = await getAssistantProvider(quickAssistant)

  // 总结上下文总是取最后5条消息
  const contextMessages = takeRight(messages, 5)

  // LLM对多条消息的总结有问题，用单条结构化的消息表示会话内容会更好
  const mainTextMessages = await filterMainTextMessages(contextMessages)

  const llmMessages = await convertMessagesToSdkMessages(mainTextMessages, quickAssistant.defaultModel)

  const AI = new AiProviderNew(quickAssistant.defaultModel || getDefaultModel(), provider)
  const { params: aiSdkParams, modelId } = await buildStreamTextParams(llmMessages, quickAssistant, provider)

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: false,
    onChunk: streamProcessorCallbacks,
    model: quickAssistant.defaultModel,
    provider: provider,
    enableReasoning: false,
    isPromptToolUse: false,
    isSupportedToolUse: false,
    isImageGenerationEndpoint: false,
    enableWebSearch: false,
    enableGenerateImage: false,
    enableUrlContext: false,
    mcpTools: []
  }

  try {
    return (
      (
        await AI.completions(modelId, aiSdkParams, {
          ...middlewareConfig,
          assistant: quickAssistant,
          topicId,
          callType: 'summary'
        })
      ).getText() || t('topics.new_topic')
    )
  } catch (error) {
    logger.error('Error during topic naming:', error)
    return ''
  }
}

/**
 * Fetch MCP tools for an assistant
 *
 * Refactored to use McpService for optimized caching and tool fetching.
 *
 * @param assistant - The assistant with MCP server configuration
 * @returns Array of enabled MCP tools
 */
export async function fetchAssistantMcpTools(assistant: Assistant) {
  let mcpTools: MCPTool[] = []

  // Get all active MCP servers using McpService (with caching)
  const activedMcpServers = await mcpService.getActiveMcpServers()
  const assistantMcpServers = assistant.mcpServers || []

  // Filter to only MCP servers enabled for this assistant
  const enabledMCPs = activedMcpServers.filter(server => assistantMcpServers.some(s => s.id === server.id))

  if (enabledMCPs && enabledMCPs.length > 0) {
    try {
      // Fetch tools for each enabled MCP server using McpService
      // This automatically handles disabledTools filtering
      const toolPromises = enabledMCPs.map(async (mcpServer: MCPServer) => {
        try {
          // Use McpService.getMcpTools() which handles:
          // - Builtin tools fetching
          // - Future MCP protocol integration
          // - Automatic filtering of disabledTools
          return await mcpService.getMcpTools(mcpServer.id)
        } catch (error) {
          logger.error(`Error fetching tools from MCP server ${mcpServer.name}:`, error as Error)
          return []
        }
      })

      const results = await Promise.allSettled(toolPromises)
      mcpTools = results
        .filter((result): result is PromiseFulfilledResult<MCPTool[]> => result.status === 'fulfilled')
        .map(result => result.value)
        .flat()
    } catch (toolError) {
      logger.error('Error fetching MCP tools:', toolError as Error)
    }
  }

  return mcpTools
}
