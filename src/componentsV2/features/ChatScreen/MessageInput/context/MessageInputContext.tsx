import type { Dispatch, SetStateAction } from 'react'
import { createContext, useContext } from 'react'

import type { Assistant, Model, Topic } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

export interface MessageInputContextValue {
  // External props
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>

  // Core state (from useMessageInputLogic)
  text: string
  setText: (text: string) => void
  files: FileMetadata[]
  setFiles: Dispatch<SetStateAction<FileMetadata[]>>
  mentions: Model[]
  setMentions: Dispatch<SetStateAction<Model[]>>

  // Derived state
  isReasoning: boolean
  isEditing: boolean
  isLoading: boolean

  // Actions
  sendMessage: () => Promise<void>
  onPause: () => Promise<void>
  cancelEditing: () => void
  handleExpand: () => void
  handlePasteImages: (uris: string[]) => Promise<void>

  // Voice state
  isVoiceActive: boolean
  setIsVoiceActive: (active: boolean) => void
}

export const MessageInputContext = createContext<MessageInputContextValue | null>(null)

export const useMessageInput = () => {
  const context = useContext(MessageInputContext)
  if (!context) {
    throw new Error('useMessageInput must be used within MessageInput')
  }
  return context
}
