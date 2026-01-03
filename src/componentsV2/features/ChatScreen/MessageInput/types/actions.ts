import type { Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

/**
 * Error types for MessageInput operations
 */
export type MessageInputErrorType =
  | 'send_failed'
  | 'edit_failed'
  | 'file_upload'
  | 'long_text_conversion'
  | 'mention_validation'
  | 'voice_recognition'
  | 'general'

/**
 * Error state for user feedback (following ToolSheet pattern)
 */
export interface MessageInputError {
  type: MessageInputErrorType
  message: string
  translationKey?: string
}

/**
 * Result type for async operations (following ToolSheet ToolOperationResult pattern)
 */
export type MessageInputResult<T = void> = { success: true; data?: T } | { success: false; error: MessageInputError }

/**
 * Send message result
 */
export interface SendMessageResult {
  messageId?: string
}

/**
 * Text processing result
 */
export interface TextProcessingResult {
  processedText: string
  convertedToFile?: FileMetadata
}

/**
 * Mention validation result
 */
export interface MentionValidationResult {
  validMentions: Model[]
  removedCount: number
}

/**
 * Loading states for async operations
 */
export interface MessageInputLoadingState {
  isSending: boolean
  isEditing: boolean
  isUploadingFile: boolean
  isProcessingVoice: boolean
}

/**
 * Create a success result
 */
export const createSuccessResult = <T>(data?: T): MessageInputResult<T> => ({
  success: true,
  data
})

/**
 * Create an error result
 */
export const createErrorResult = (
  type: MessageInputErrorType,
  message: string,
  translationKey?: string
): MessageInputResult<never> => ({
  success: false,
  error: { type, message, translationKey }
})
