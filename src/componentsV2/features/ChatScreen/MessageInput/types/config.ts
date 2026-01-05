import type { ComponentType } from 'react'

import type { Assistant, Topic } from '@/types/assistant'

import type { MessageInputError, MessageInputState } from '.'

/**
 * Configuration passed to MessageInput.Root
 */
export interface MessageInputConfig {
  topic: Topic
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

/**
 * Subscriber interface for MessageInputService (following ModelSheet SheetSubscriber pattern)
 */
export interface MessageInputSubscriber {
  onStateChange: (state: MessageInputState) => void
  onError: (error: MessageInputError | null) => void
}

/**
 * Tool key type - strongly typed
 */
export type AssistantToolKey = 'enableGenerateImage' | 'enableWebSearch'

/**
 * Icon component type for tools
 */
export type ToolIconComponent = ComponentType<{ size: number; className: string }>

/**
 * Tool configuration for ToolPreview
 */
export interface ToolConfig {
  key: AssistantToolKey
  icon: ToolIconComponent
  labelKey: string
  isEnabled: (assistant: Assistant) => boolean
}

/**
 * TextField configuration constants
 */
export const TEXT_FIELD_CONFIG = {
  LINE_HEIGHT: 26,
  MAX_VISIBLE_LINES: 4,
  MAX_INPUT_HEIGHT: 96,
  MIN_INPUT_HEIGHT: 34
} as const

/**
 * Long text threshold for file conversion
 */
export const LONG_TEXT_THRESHOLD = 5000
