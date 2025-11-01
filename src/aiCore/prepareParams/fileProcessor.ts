/**
 * 文件处理模块
 * 处理文件内容提取、文件格式转换、文件上传等逻辑
 */

import type { FilePart, TextPart } from 'ai'
import { File } from 'expo-file-system'

import { loggerService } from '@/services/LoggerService'
import { getProviderByModel } from '@/services/ProviderService'
import type { Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import type { FileMessageBlock, Message } from '@/types/message'
import { findFileBlocks } from '@/utils/messageUtils/find'

import { getAiSdkProviderId } from '../provider/factory'
import { getFileSizeLimit, supportsImageInput, supportsLargeFileUpload, supportsPdfInput } from './modelCapabilities'

const logger = loggerService.withContext('fileProcessor')

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
        const fileContent = new File(file.path).textSync().trim()
        const fileNameRow = 'file: ' + file.origin_name + '\n\n'
        text = text + fileNameRow + fileContent + divider
      }

      return text
    }
  }

  return ''
}

/**
 * 将文件块转换为文本部分
 */
export async function convertFileBlockToTextPart(fileBlock: FileMessageBlock): Promise<TextPart | null> {
  const file = fileBlock.file

  // 处理文本文件
  if (file.type === FileTypes.TEXT) {
    try {
      const fileContent = new File(file.path).textSync().trim()
      return {
        type: 'text',
        text: `${file.origin_name}\n${fileContent.trim()}`
      }
    } catch (error) {
      logger.warn('Failed to read text file:', error as Error)
    }
  }

  // 处理文档文件（PDF、Word、Excel等）- 提取为文本内容
  if (file.type === FileTypes.DOCUMENT) {
    try {
      const fileContent = new File(file.path).textSync().trim()
      return {
        type: 'text',
        text: `${file.origin_name}\n${fileContent.trim()}`
      }
    } catch (error) {
      logger.warn(`Failed to extract text from document ${file.origin_name}:`, error as Error)
    }
  }

  return null
}

/**
 * 处理Gemini大文件上传
 */
export async function handleGeminiFileUpload(_file: FileMetadata, _model: Model): Promise<FilePart | null> {
  throw new Error('Not implemented')

  // try {
  //   const provider = getProviderByModel(model)

  //   // 检查文件是否已经上传过
  //   const fileMetadata = await window.api.fileService.retrieve(provider, file.id)

  //   if (fileMetadata.status === 'success' && fileMetadata.originalFile?.file) {
  //     const remoteFile = fileMetadata.originalFile.file as any // 临时类型断言，因为File类型定义可能不完整
  //     // 注意：AI SDK的FilePart格式和Gemini原生格式不同，这里需要适配
  //     // 暂时返回null让它回退到文本处理，或者需要扩展FilePart支持uri
  //     logger.info(`File ${file.origin_name} already uploaded to Gemini with URI: ${remoteFile.uri || 'unknown'}`)
  //     return null
  //   }

  //   // 如果文件未上传，执行上传
  //   const uploadResult = await window.api.fileService.upload(provider, file)

  //   if (uploadResult.originalFile?.file) {
  //     const remoteFile = uploadResult.originalFile.file as any // 临时类型断言
  //     logger.info(`File ${file.origin_name} uploaded to Gemini with URI: ${remoteFile.uri || 'unknown'}`)
  //     // 同样，这里需要处理URI格式的文件引用
  //     return null
  //   }
  // } catch (error) {
  //   logger.error(`Failed to upload file ${file.origin_name} to Gemini:`, error as Error)
  // }

  // return null
}

/**
 * 将文件块转换为FilePart（用于原生文件支持）
 */
export async function convertFileBlockToFilePart(fileBlock: FileMessageBlock, model: Model): Promise<FilePart | null> {
  const file = fileBlock.file
  const fileSizeLimit = getFileSizeLimit(model, file.type)

  try {
    // 处理PDF文档
    if (file.type === FileTypes.DOCUMENT && file.ext === '.pdf' && supportsPdfInput(model)) {
      // 检查文件大小限制
      if (file.size > fileSizeLimit) {
        // 如果支持大文件上传（如Gemini File API），尝试上传
        if (supportsLargeFileUpload(model)) {
          logger.info(`Large PDF file ${file.origin_name} (${file.size} bytes) attempting File API upload`)
          const uploadResult = await handleGeminiFileUpload(file, model)

          if (uploadResult) {
            return uploadResult
          }

          // 如果上传失败，回退到文本处理
          logger.warn(`Failed to upload large PDF ${file.origin_name}, falling back to text extraction`)
          return null
        } else {
          logger.warn(`PDF file ${file.origin_name} exceeds size limit (${file.size} > ${fileSizeLimit})`)
          return null // 文件过大，回退到文本处理
        }
      }

      const _file = new File(file.path)
      return {
        type: 'file',
        data: await _file.base64(),
        mediaType: _file.type || 'application/pdf',
        filename: file.origin_name
      }
    }

    // 处理图片文件
    if (file.type === FileTypes.IMAGE && supportsImageInput(model)) {
      // 检查文件大小
      if (file.size > fileSizeLimit) {
        logger.warn(`Image file ${file.origin_name} exceeds size limit (${file.size} > ${fileSizeLimit})`)
        return null
      }

      const image = new File(file.path)

      // 处理MIME类型，特别是jpg->jpeg的转换（Anthropic要求）
      let mediaType = image.type
      const provider = getProviderByModel(model)
      const aiSdkId = getAiSdkProviderId(provider)

      if (aiSdkId === 'anthropic' && mediaType === 'image/jpg') {
        mediaType = 'image/jpeg'
      }

      return {
        type: 'file',
        data: await image.base64(),
        mediaType: mediaType || 'image/jpeg',
        filename: file.origin_name
      }
    }

    // 处理其他文档类型（Word、Excel等）
    if (file.type === FileTypes.DOCUMENT && file.ext !== '.pdf') {
      // 目前大多数提供商不支持Word等格式的原生处理
      // 返回null会触发上层调用convertFileBlockToTextPart进行文本提取
      // 这与Legacy架构中的处理方式一致
      logger.debug(`Document file ${file.origin_name} with extension ${file.ext} will use text extraction fallback`)
      return null
    }
  } catch (error) {
    logger.warn(`Failed to process file ${file.origin_name}:`, error as Error)
  }

  return null
}
