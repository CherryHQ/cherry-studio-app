import { StreamTextParams } from '@cherrystudio/ai-core'
import { isEmpty } from 'lodash'

import LegacyAiProvider from '@/aiCore'
import AiProvider from '@/aiCore'
import ModernAiProvider from '@/aiCore/index_new'
import { AiSdkMiddlewareConfig } from '@/aiCore/middleware/aisdk/AiSdkMiddlewareBuilder'
import { CompletionsParams } from '@/aiCore/middleware/schemas'
import { buildStreamTextParams, convertMessagesToSdkMessages } from '@/aiCore/transformParameters'
import { isEmbeddingModel } from '@/config/models/embedding'
import i18n from '@/i18n'
import { loggerService } from '@/services/LoggerService'
import { Assistant, Model, Provider } from '@/types/assistant'
import { Chunk } from '@/types/chunk'
import { Message } from '@/types/message'
import { SdkModel } from '@/types/sdk'
import { isEnabledToolUse } from '@/utils/mcpTool'
import { filterMainTextMessages } from '@/utils/messageUtils/filters'

import { createBlankAssistant, getAssistantProvider, getDefaultModel } from './AssistantService'
import { BlockManager, createCallbacks } from './messageStreaming'
import { createStreamProcessor, StreamProcessorCallbacks } from './StreamProcessingService'
const logger = loggerService.withContext('fetchChatCompletion')

export async function fetchChatCompletion({
  messages,
  assistant,
  options,
  onChunkReceived
}: {
  messages: StreamTextParams['messages']
  assistant: Assistant
  options: {
    signal?: AbortSignal
    timeout?: number
    headers?: Record<string, string>
  }

  onChunkReceived: (chunk: Chunk) => void
}) {
  const provider = await getAssistantProvider(assistant)

  const AI = new ModernAiProvider(assistant.model || getDefaultModel(), provider)

  // 使用 transformParameters 模块构建参数
  const {
    params: aiSdkParams,
    modelId,
    capabilities
  } = await buildStreamTextParams(messages, assistant, provider, {
    // mcpTools: mcpTools,
    enableTools: isEnabledToolUse(assistant),
    webSearchProviderId: assistant.webSearchProviderId,
    requestOptions: options
  })

  logger.info('fetchChatCompletion', capabilities)

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: assistant.settings?.streamOutput ?? true,
    onChunk: onChunkReceived,
    model: assistant.model,
    provider: provider,
    enableReasoning: capabilities.enableReasoning,
    // enableTool: assistant.settings?.toolUseMode === 'prompt',
    enableWebSearch: capabilities.enableWebSearch
    // mcpTools
  }

  // --- Call AI Completions ---
  // onChunkReceived({ type: ChunkType.LLM_RESPONSE_CREATED })
  await AI.completions(modelId, aiSdkParams, middlewareConfig)
}

export async function fetchModels(provider: Provider): Promise<SdkModel[]> {
  const AI = new AiProvider(provider)

  try {
    return await AI.models()
  } catch (error) {
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

  const assistant = createBlankAssistant()
  assistant.model = model

  try {
    if (isEmbeddingModel(model)) {
      await ai.getEmbeddingDimensions(model)
    } else {
      const params: CompletionsParams = {
        callType: 'check',
        messages: 'hi',
        assistant,
        streamOutput: true,
        shouldThrow: true
      }

      // Try streaming check first
      const result = await ai.completions(params)

      if (!result.getText()) {
        throw new Error('No response received')
      }
    }
  } catch (error: any) {
    if (error.message.includes('stream')) {
      const params: CompletionsParams = {
        callType: 'check',
        messages: 'hi',
        assistant,
        streamOutput: false,
        shouldThrow: true
      }
      const result = await ai.completions(params)

      if (!result.getText()) {
        throw new Error('No response received')
      }
    } else {
      throw error
    }
  }
}
