/**
 * AI SDK 参数转换模块
 * 统一管理从各个 apiClient 提取的参数处理和转换功能
 */

import {
  AssistantModelMessage,
  FilePart,
  ImagePart,
  ModelMessage,
  stepCountIs,
  type StreamTextParams,
  TextPart,
  Tool,
  UserModelMessage
} from '@cherrystudio/ai-core'
import { aiSdk } from '@cherrystudio/ai-core'
// import { jsonSchemaToZod } from 'json-schema-to-zod'
import { File } from 'expo-file-system/next'

import {
  isNotSupportTemperatureAndTopP,
  isOpenRouterBuiltInWebSearchModel,
  isSupportedFlexServiceTier
} from '@/config/models'
import { isGenerateImageModel, isSupportedDisableGenerationModel } from '@/config/models/image'
import {
  isReasoningModel,
  isSupportedReasoningEffortModel,
  isSupportedThinkingTokenModel
} from '@/config/models/reasoning'
import { isVisionModel } from '@/config/models/vision'
import { isWebSearchModel } from '@/config/models/webSearch'
import { DEFAULT_MAX_TOKENS, defaultTimeout } from '@/constants'
import { getAssistantSettings, getDefaultModel } from '@/services/AssistantService'
import { Assistant, Model, Provider } from '@/types/assistant'
import { ExtractResults } from '@/types/extract'
import { FileTypes } from '@/types/file'
import { FileMessageBlock, ImageMessageBlock, Message, ThinkingMessageBlock } from '@/types/message'
import { MCPTool } from '@/types/tool'
import { findFileBlocks, findImageBlocks, findThinkingBlocks, getMainTextContent } from '@/utils/messageUtils/find'
import { buildSystemPrompt } from '@/utils/prompt'

import { webSearchTool } from './tools/WebSearchTool'
import { buildProviderOptions } from './utils/options'

const { tool } = aiSdk

/**
 * 获取温度参数
 */
export function getTemperature(assistant: Assistant, model: Model): number | undefined {
  return isNotSupportTemperatureAndTopP(model) ? undefined : assistant.settings?.temperature
}

/**
 * 获取 TopP 参数
 */
export function getTopP(assistant: Assistant, model: Model): number | undefined {
  return isNotSupportTemperatureAndTopP(model) ? undefined : assistant.settings?.topP
}

/**
 * 获取超时设置
 */
export function getTimeout(model: Model): number {
  if (isSupportedFlexServiceTier(model)) {
    return 15 * 1000 * 60
  }

  return defaultTimeout
}

/**
 * 构建系统提示词
 */
export async function buildSystemPromptWithTools(
  prompt: string,
  mcpTools?: MCPTool[],
  assistant?: Assistant
): Promise<string> {
  return await buildSystemPrompt(prompt, mcpTools, assistant)
}

/**
 * 提取文件内容
 */
export async function extractFileContent(message: Message): Promise<string> {
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
        const fileContent = new File(file.path).text().trim()
        const fileNameRow = 'file: ' + file.origin_name + '\n\n'
        text = text + fileNameRow + fileContent + divider
      }

      return text
    }
  }

  return ''
}

/**
 * 提取外部工具搜索关键词和问题
 * 从用户消息中提取用于网络搜索和知识库搜索的关键词
 */
export async function extractSearchKeywords(
  lastUserMessage: Message,
  assistant: Assistant,
  options: {
    shouldWebSearch?: boolean
    shouldKnowledgeSearch?: boolean
    lastAnswer?: Message
  } = {}
): Promise<ExtractResults | undefined> {
  // todo
  const { shouldWebSearch = false, shouldKnowledgeSearch = false, lastAnswer } = options

  if (!lastUserMessage) return undefined

  return await getFallbackResult()

  async function getFallbackResult(): Promise<ExtractResults> {
    const fallbackContent = await getMainTextContent(lastUserMessage)
    return {
      websearch: shouldWebSearch ? { question: [fallbackContent || 'search'] } : undefined,
      knowledge: shouldKnowledgeSearch
        ? {
            question: [fallbackContent || 'search'],
            rewrite: fallbackContent || 'search'
          }
        : undefined
    }
  }
}

/**
 * 转换消息为 AI SDK 参数格式
 * 基于 OpenAI 格式的通用转换，支持文本、图片和文件
 */
export async function convertMessageToSdkParam(message: Message, isVisionModel = false): Promise<ModelMessage> {
  const content = await getMainTextContent(message)
  const fileBlocks = await findFileBlocks(message)
  const imageBlocks = await findImageBlocks(message)
  const reasoningBlocks = await findThinkingBlocks(message)

  if (message.role === 'user' || message.role === 'system') {
    return convertMessageToUserModelMessage(content, fileBlocks, imageBlocks, isVisionModel)
  } else {
    return convertMessageToAssistantModelMessage(content, fileBlocks, reasoningBlocks)
  }
}

async function convertMessageToUserModelMessage(
  content: string,
  fileBlocks: FileMessageBlock[],
  imageBlocks: ImageMessageBlock[],
  isVisionModel = false
): Promise<UserModelMessage> {
  const parts: (TextPart | FilePart | ImagePart)[] = []

  if (content) {
    parts.push({ type: 'text', text: content })
  }

  // 处理图片（仅在支持视觉的模型中）
  if (isVisionModel) {
    for (const imageBlock of imageBlocks) {
      if (imageBlock.file) {
        try {
          const image = new File(imageBlock.file.path)
          parts.push({
            type: 'image',
            image: image.base64(),
            mediaType: image.type || 'image/png'
          })
        } catch (error) {
          console.warn('Failed to load image:', error)
        }
      } else if (imageBlock.url) {
        parts.push({
          type: 'image',
          image: imageBlock.url
        })
      }
    }
  }

  // 处理文件
  for (const fileBlock of fileBlocks) {
    const textPart = await convertFileBlockToTextPart(fileBlock)

    if (textPart) {
      parts.push(textPart)
    }
  }

  return {
    role: 'user',
    content: parts
  }
}

async function convertMessageToAssistantModelMessage(
  content: string,
  fileBlocks: FileMessageBlock[],
  thinkingBlocks: ThinkingMessageBlock[]
): Promise<AssistantModelMessage> {
  const parts: (TextPart | FilePart)[] = []

  if (content) {
    parts.push({ type: 'text', text: content })
  }

  for (const thinkingBlock of thinkingBlocks) {
    parts.push({ type: 'text', text: thinkingBlock.content })
  }

  for (const fileBlock of fileBlocks) {
    const textPart = await convertFileBlockToTextPart(fileBlock)

    if (textPart) {
      parts.push(textPart)
    }
  }

  return {
    role: 'assistant',
    content: parts
  }
}

async function convertFileBlockToTextPart(fileBlock: FileMessageBlock): Promise<TextPart | null> {
  const file = fileBlock.file

  if ([FileTypes.TEXT, FileTypes.DOCUMENT].includes(file.type)) {
    try {
      const fileContent = new File(file.path).text().trim()
      return {
        type: 'text',
        text: `${file.origin_name}\n${fileContent.trim()}`
      }
    } catch (error) {
      console.warn('Failed to read file:', error)
    }
  }

  return null
}

/**
 * 转换 Cherry Studio 消息数组为 AI SDK 消息数组
 */
export async function convertMessagesToSdkMessages(
  messages: Message[],
  model: Model
): Promise<StreamTextParams['messages']> {
  const sdkMessages: StreamTextParams['messages'] = []
  const isVision = isVisionModel(model)

  for (const message of messages) {
    const sdkMessage = await convertMessageToSdkParam(message, isVision)
    sdkMessages.push(sdkMessage)
  }

  return sdkMessages
}

/**
 * 构建 AI SDK 流式参数
 * 这是主要的参数构建函数，整合所有转换逻辑
 */
export async function buildStreamTextParams(
  sdkMessages: StreamTextParams['messages'],
  assistant: Assistant,
  provider: Provider,
  options: {
    mcpTools?: MCPTool[]
    enableTools?: boolean
    enableWebSearch?: boolean
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
  capabilities: { enableReasoning?: boolean; enableWebSearch?: boolean; enableGenerateImage?: boolean }
}> {
  const { mcpTools, enableTools, webSearchProviderId } = options

  const model = assistant.model || getDefaultModel()

  const { maxTokens, reasoning_effort } = getAssistantSettings(assistant)

  // 这三个变量透传出来，交给下面动态启用插件/中间件
  // 也可以在外部构建好再传入buildStreamTextParams
  const enableReasoning =
    ((isSupportedThinkingTokenModel(model) || isSupportedReasoningEffortModel(model)) &&
      reasoning_effort !== undefined) ||
    (isReasoningModel(model) && !isSupportedThinkingTokenModel(model) && !isSupportedReasoningEffortModel(model))
  const enableWebSearch =
    (assistant.enableWebSearch && isWebSearchModel(model)) ||
    isOpenRouterBuiltInWebSearchModel(model) ||
    model.id.includes('sonar') ||
    false

  const enableGenerateImage =
    isGenerateImageModel(model) &&
    (isSupportedDisableGenerationModel(model) ? assistant.enableGenerateImage || false : true)

  // 构建系统提示
  // const { tools } = setupToolsConfig({
  //   mcpTools,
  //   model,
  //   enableToolUse: enableTools
  // })
  const tools: Record<string, Tool> = {}

  if (webSearchProviderId) {
    tools['builtin_web_search'] = webSearchTool(webSearchProviderId)
  }

  // 构建真正的 providerOptions
  const providerOptions = buildProviderOptions(assistant, model, provider, {
    enableReasoning,
    enableWebSearch,
    enableGenerateImage
  })

  // 构建基础参数
  const params: StreamTextParams = {
    messages: sdkMessages,
    maxOutputTokens: maxTokens || DEFAULT_MAX_TOKENS,
    temperature: getTemperature(assistant, model),
    topP: getTopP(assistant, model),
    abortSignal: options.requestOptions?.signal,
    headers: options.requestOptions?.headers,
    providerOptions,
    tools,
    stopWhen: stepCountIs(10)
  }

  if (assistant.prompt) {
    params.system = assistant.prompt
  }

  return { params, modelId: model.id, capabilities: { enableReasoning, enableWebSearch, enableGenerateImage } }
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
