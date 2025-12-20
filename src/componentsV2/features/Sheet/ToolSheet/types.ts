import type { ReactElement, ReactNode } from 'react'

import type { Assistant, Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

/**
 * Data passed to presentToolSheet for sheet initialization
 */
export interface ToolSheetData {
  mentions: Model[]
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  assistant: Assistant | null
  updateAssistant: ((assistant: Assistant) => Promise<void>) | null
}

/**
 * Loading states for async operations
 */
export interface ToolSheetLoadingState {
  isAddingImage: boolean
  isAddingFile: boolean
  isTakingPhoto: boolean
  isUpdatingAIFeature: boolean
}

/**
 * Error types for user feedback
 */
export type ToolSheetErrorType = 'permission' | 'upload' | 'ai_feature' | 'camera' | 'general'

/**
 * Error state for user feedback
 */
export interface ToolSheetError {
  type: ToolSheetErrorType
  message: string
  translationKey?: string
}

/**
 * Result type for async operations
 */
export type ToolOperationResult<T = void> = { success: true; data?: T } | { success: false; error: ToolSheetError }

/**
 * AI Feature type union
 */
export type AIFeatureType = 'webSearch' | 'generateImage' | 'none'

/**
 * External tool configuration (web search, generate image)
 */
export interface ExternalToolConfig {
  key: string
  label: string
  icon: ReactElement<{ className?: string }>
  onPress: () => void
  onSwitchPress?: () => void
  isActive: boolean
  shouldShow: boolean
  isLoading?: boolean
}

/**
 * System tool configuration (camera, photo, file)
 */
export interface SystemToolConfig {
  key: string
  label: string
  icon: ReactNode
  onPress: () => void
  isLoading?: boolean
  isDisabled?: boolean
}

/**
 * File handler loading state
 */
export interface FileHandlerLoadingState {
  isAddingImage: boolean
  isAddingFile: boolean
  isTakingPhoto: boolean
}
