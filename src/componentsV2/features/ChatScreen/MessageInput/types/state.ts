import type { Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

/**
 * Core input state managed by MessageInput
 */
export interface MessageInputState {
  text: string
  files: FileMetadata[]
  mentions: Model[]
  isVoiceActive: boolean
}

/**
 * Derived state computed from core state and props
 */
export interface MessageInputDerivedState {
  isReasoning: boolean
  isEditing: boolean
  isLoading: boolean
  hasContent: boolean
  canSend: boolean
}

/**
 * Voice input state
 */
export interface VoiceInputState {
  isActive: boolean
  isProcessing: boolean
  transcript: string
}

/**
 * Input height state for TextField
 */
export interface InputHeightState {
  currentHeight: number | undefined
  showExpandButton: boolean
}

/**
 * Initial state factory
 */
export const createInitialState = (): MessageInputState => ({
  text: '',
  files: [],
  mentions: [],
  isVoiceActive: false
})
