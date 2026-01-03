import type { Dispatch, SetStateAction } from 'react'

import type { Assistant, Model, Topic } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

/**
 * Context value interface for MessageInput
 */
export interface MessageInputContextValue {
  // Configuration (immutable during render)
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>

  // Core state
  text: string
  files: FileMetadata[]
  mentions: Model[]

  // State setters
  setText: (text: string) => void
  setFiles: Dispatch<SetStateAction<FileMetadata[]>>
  setMentions: Dispatch<SetStateAction<Model[]>>

  // Derived state
  isReasoning: boolean
  isEditing: boolean
  isLoading: boolean

  // Actions
  sendMessage: (overrideText?: string) => Promise<void>
  onPause: () => Promise<void>
  cancelEditing: () => void
  handleExpand: () => void
  handlePasteImages: (uris: string[]) => Promise<void>

  // Voice state
  isVoiceActive: boolean
  setIsVoiceActive: (active: boolean) => void
}
