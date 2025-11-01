/**
 * 消息转换模块
 * 将 Cherry Studio 消息格式转换为 AI SDK 消息格式
 */

import type { AssistantModelMessage, FilePart, ImagePart, ModelMessage, TextPart, UserModelMessage } from 'ai'
import { File as ExpoFile } from 'expo-file-system'

import { isVisionModel } from '@/config/models'
import { loggerService } from '@/services/LoggerService'
import type { Model } from '@/types/assistant'
import type { FileMessageBlock, ImageMessageBlock, Message, ThinkingMessageBlock } from '@/types/message'
import { findFileBlocks, findImageBlocks, findThinkingBlocks, getMainTextContent } from '@/utils/messageUtils/find'

import { convertFileBlockToFilePart, convertFileBlockToTextPart } from './fileProcessor'

const logger = loggerService.withContext('messageConverter')

/**
 * 转换消息为 AI SDK 参数格式
 * 基于 OpenAI 格式的通用转换，支持文本、图片和文件
 */
export async function convertMessageToSdkParam(
  message: Message,
  isVisionModel = false,
  model?: Model
): Promise<ModelMessage> {
  const content = await getMainTextContent(message)
  const fileBlocks = await findFileBlocks(message)
  const imageBlocks = await findImageBlocks(message)
  const reasoningBlocks = await findThinkingBlocks(message)

  if (message.role === 'user' || message.role === 'system') {
    return convertMessageToUserModelMessage(content, fileBlocks, imageBlocks, isVisionModel, model)
  } else {
    return convertMessageToAssistantModelMessage(content, fileBlocks, reasoningBlocks, model)
  }
}

/**
 * 转换为用户模型消息
 */
async function convertMessageToUserModelMessage(
  content: string,
  fileBlocks: FileMessageBlock[],
  imageBlocks: ImageMessageBlock[],
  isVisionModel = false,
  model?: Model
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
          const image = new ExpoFile(imageBlock.file.path)
          parts.push({
            type: 'image',
            image: await image.base64(),
            mediaType: image.type || undefined
          })
        } catch (error) {
          logger.warn('Failed to load image:', error as Error)
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
    const file = fileBlock.file
    let processed = false

    // 优先尝试原生文件支持（PDF、图片等）
    if (model) {
      const filePart = await convertFileBlockToFilePart(fileBlock, model)

      if (filePart) {
        parts.push(filePart)
        logger.debug(`File ${file.origin_name} processed as native file format`)
        processed = true
      }
    }

    // 如果原生处理失败，回退到文本提取
    if (!processed) {
      const textPart = await convertFileBlockToTextPart(fileBlock)

      if (textPart) {
        parts.push(textPart)
        logger.debug(`File ${file.origin_name} processed as text content`)
      } else {
        logger.warn(`File ${file.origin_name} could not be processed in any format`)
      }
    }
  }

  return {
    role: 'user',
    content: parts
  }
}

/**
 * 转换为助手模型消息
 */
async function convertMessageToAssistantModelMessage(
  content: string,
  fileBlocks: FileMessageBlock[],
  thinkingBlocks: ThinkingMessageBlock[],
  model?: Model
): Promise<AssistantModelMessage> {
  const parts: (TextPart | FilePart)[] = []

  if (content) {
    parts.push({ type: 'text', text: content })
  }

  for (const thinkingBlock of thinkingBlocks) {
    parts.push({ type: 'text', text: thinkingBlock.content })
  }

  for (const fileBlock of fileBlocks) {
    // 优先尝试原生文件支持（PDF等）
    if (model) {
      const filePart = await convertFileBlockToFilePart(fileBlock, model)

      if (filePart) {
        parts.push(filePart)
        continue
      }
    }

    // 回退到文本处理
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

/**
 * 转换 Cherry Studio 消息数组为 AI SDK 消息数组
 */
export async function convertMessagesToSdkMessages(messages: Message[], model: Model): Promise<ModelMessage[]> {
  const sdkMessages: ModelMessage[] = []
  const isVision = isVisionModel(model)

  for (const message of messages) {
    const sdkMessage = await convertMessageToSdkParam(message, isVision, model)
    sdkMessages.push(sdkMessage)
  }

  return sdkMessages
}
