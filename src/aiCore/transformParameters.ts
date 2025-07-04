/**
 * AI SDK 参数转换模块
 * 统一管理从各个 apiClient 提取的参数处理和转换功能
 */

import { type CoreMessage, type StreamTextParams } from '@cherrystudio/ai-core'
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
import { Assistant, Model } from '@/types/assistant'
import { FileTypes } from '@/types/file'
import { MCPTool, MCPToolInputSchema } from '@/types/mcp'
import { Message } from '@/types/message'
import { findFileBlocks, findImageBlocks, getMainTextContent } from '@/utils/messageUtils/find'
import { buildSystemPrompt } from '@/utils/prompt'

import { buildProviderOptions } from './utils/reasoning'

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
 * 转换消息为 AI SDK 参数格式
 * 基于 OpenAI 格式的通用转换，支持文本、图片和文件
 */
export async function convertMessageToSdkParam(message: Message, isVisionModel = false): Promise<any> {
  const content = await getMainTextContent(message)
  const fileBlocks = await findFileBlocks(message)
  const imageBlocks = await findImageBlocks(message)

  // 简单消息（无文件无图片）
  if (fileBlocks.length === 0 && imageBlocks.length === 0) {
    return {
      role: message.role === 'system' ? 'user' : message.role,
      content
    }
  }

  // 复杂消息（包含文件或图片）
  const parts: any[] = []

  if (content) {
    parts.push({ type: 'text', text: content })
  }

  // 处理图片（仅在支持视觉的模型中）
  if (isVisionModel) {
    for (const imageBlock of imageBlocks) {
      if (imageBlock.file) {
        try {
          const base64 = new File(imageBlock.file.path).base64()
          parts.push({
            type: 'image_url',
            image_url: { url: `data:image/jpg;base64,${base64}` }
          })
        } catch (error) {
          console.warn('Failed to load image:', error)
        }
      } else if (imageBlock.url && imageBlock.url.startsWith('data:')) {
        parts.push({
          type: 'image_url',
          image_url: { url: imageBlock.url }
        })
      }
    }
  }

  // 处理文件
  for (const fileBlock of fileBlocks) {
    const file = fileBlock.file
    if (!file) continue

    if ([FileTypes.TEXT, FileTypes.DOCUMENT].includes(file.type)) {
      try {
        const fileContent = new File(file.path).text().trim()
        parts.push({
          type: 'text',
          text: `${file.origin_name}\n${fileContent.trim()}`
        })
      } catch (error) {
        console.warn('Failed to read file:', error)
      }
    }
  }

  return {
    role: message.role === 'system' ? 'user' : message.role,
    content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts
  }
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
  options: {
    mcpTools?: MCPTool[]
    // FIXME: 上游没传
    enableTools?: boolean
    requestOptions?: {
      signal?: AbortSignal
      timeout?: number
      headers?: Record<string, string>
    }
  } = {}
): Promise<{ params: StreamTextParams; modelId: string }> {
  const { mcpTools } = options

  const model = assistant.model || getDefaultModel()

  const { maxTokens, reasoning_effort } = getAssistantSettings(assistant)

  const enableReasoning =
    ((isSupportedThinkingTokenModel(model) || isSupportedReasoningEffortModel(model)) &&
      reasoning_effort !== undefined) ||
    (isReasoningModel(model) && (!isSupportedThinkingTokenModel(model) || !isSupportedReasoningEffortModel(model)))

  const enableWebSearch =
    (assistant.enableWebSearch && isWebSearchModel(model)) ||
    isOpenRouterBuiltInWebSearchModel(model) ||
    model.id.includes('sonar') ||
    false

  const enableGenerateImage =
    isGenerateImageModel(model) &&
    (isSupportedDisableGenerationModel(model) ? assistant.enableGenerateImage || false : true)

  // 构建系统提示
  let systemPrompt = assistant.prompt || ''

  // TODO:根据调用类型判断是否添加systemPrompt
  if (mcpTools && mcpTools.length > 0 && assistant.settings?.toolUseMode === 'prompt') {
    systemPrompt = await buildSystemPromptWithTools(systemPrompt, mcpTools, assistant)
  }

  // 构建真正的 providerOptions
  const providerOptions = buildProviderOptions(assistant, model, {
    enableReasoning,
    enableWebSearch,
    enableGenerateImage
  })

  // 构建基础参数
  const params: StreamTextParams = {
    messages: sdkMessages,
    maxTokens: maxTokens || DEFAULT_MAX_TOKENS,
    temperature: getTemperature(assistant, model),
    topP: getTopP(assistant, model),
    system: systemPrompt || undefined,
    abortSignal: options.requestOptions?.signal,
    headers: options.requestOptions?.headers,
    providerOptions,
    maxSteps: 10
  }

  // const tools = mcpTools ? convertMcpToolsToAiSdkTools(mcpTools) : {}
  // console.log('tools', tools)
  // console.log('enableTools', assistant?.mcpServers?.length)

  // // console.log('tools.length > 0', tools.length > 0)
  // // 添加工具（如果启用且有工具）
  // if (!!assistant?.mcpServers?.length && Object.keys(tools).length > 0) {
  //   params.tools = tools
  // }

  return { params, modelId: model.id }
}

/**
 * 构建非流式的 generateText 参数
 */
export async function buildGenerateTextParams(
  messages: CoreMessage[],
  assistant: Assistant,
  options: {
    mcpTools?: MCPTool[]
    enableTools?: boolean
  } = {}
): Promise<any> {
  // 复用流式参数的构建逻辑
  return await buildStreamTextParams(messages, assistant, options)
}

/**
 * 将 MCPToolInputSchema 转换为 JSONSchema7 格式
 */
function convertMcpSchemaToJsonSchema7(schema: MCPToolInputSchema): any {
  // 创建符合 JSONSchema7 的对象
  const jsonSchema7: Record<string, any> = {
    type: 'object',
    properties: schema.properties || {},
    required: schema.required || []
  }

  // 如果有 description，添加它
  if (schema.description) {
    jsonSchema7.description = schema.description
  }

  // 如果有 title，添加它
  if (schema.title) {
    jsonSchema7.title = schema.title
  }

  return jsonSchema7
}

/**
 * 将 MCPTool 转换为 AI SDK 工具格式
 */
// export function convertMcpToolsToAiSdkTools(mcpTools: MCPTool[]): Record<string, any> {
//   const tools: Record<string, any> = {}

//   for (const mcpTool of mcpTools) {
//     console.log('mcpTool', mcpTool.inputSchema)
//     tools[mcpTool.name] = tool({
//       description: mcpTool.description || `Tool from ${mcpTool.serverName}`,
//       parameters: jsonSchema<Record<string, object>>(convertMcpSchemaToJsonSchema7(mcpTool.inputSchema)),
//       execute: async params => {
//         console.log('execute_params', params)
//         // 创建适配的 MCPToolResponse 对象
//         const toolResponse: MCPToolResponse = {
//           id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//           tool: mcpTool,
//           arguments: params,
//           status: 'invoking',
//           toolCallId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
//         }

//         try {
//           // 复用现有的 callMCPTool 函数
//           const result = await callMCPTool(toolResponse)

//           // 返回结果，AI SDK 会处理序列化
//           if (result.isError) {
//             throw new Error(result.content?.[0]?.text || 'Tool execution failed')
//           }

//           console.log('result', result)
//           // 返回工具执行结果
//           return {
//             success: true,
//             data: result
//           }
//         } catch (error) {
//           console.error(`MCP Tool execution failed: ${mcpTool.name}`, error)
//           throw new Error(
//             `Tool ${mcpTool.name} execution failed: ${error instanceof Error ? error.message : String(error)}`
//           )
//         }
//       }
//     })
//   }

//   return tools
// }
