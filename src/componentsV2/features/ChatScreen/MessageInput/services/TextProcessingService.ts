import { saveTextAsFile } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'

import type { MessageInputResult, TextProcessingResult } from '../types'
import { createErrorResult, createSuccessResult, LONG_TEXT_THRESHOLD } from '../types'

const logger = loggerService.withContext('TextProcessingService')

export interface TextProcessingOptions {
  threshold?: number
  onConvertToFile?: (file: FileMetadata) => void
}

/**
 * Check if text exceeds the long text threshold
 */
export function isLongText(text: string, threshold: number = LONG_TEXT_THRESHOLD): boolean {
  return text.length > threshold
}

/**
 * Process input text, converting long text to file if needed
 */
export async function processInputText(
  text: string,
  options: TextProcessingOptions = {}
): Promise<MessageInputResult<TextProcessingResult>> {
  const threshold = options.threshold ?? LONG_TEXT_THRESHOLD

  if (!isLongText(text, threshold)) {
    return createSuccessResult({ processedText: text })
  }

  try {
    logger.info(`Long text detected: ${text.length} characters, converting to file`)
    const fileMetadata = await saveTextAsFile(text)
    options.onConvertToFile?.(fileMetadata)

    return createSuccessResult({
      processedText: '',
      convertedToFile: fileMetadata
    })
  } catch (error) {
    logger.error('Error converting long text to file:', error)
    return createErrorResult(
      'long_text_conversion',
      error instanceof Error ? error.message : 'Unknown error',
      'error.text.conversion_failed'
    )
  }
}
