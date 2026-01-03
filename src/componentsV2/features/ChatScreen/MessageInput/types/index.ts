// State types
export type { InputHeightState, MessageInputDerivedState, MessageInputState, VoiceInputState } from './state'
export { createInitialState } from './state'

// Action types
export type {
  MentionValidationResult,
  MessageInputError,
  MessageInputErrorType,
  MessageInputLoadingState,
  MessageInputResult,
  SendMessageResult,
  TextProcessingResult
} from './actions'
export { createErrorResult, createSuccessResult } from './actions'

// Config types
export type {
  AssistantToolKey,
  MessageInputConfig,
  MessageInputSubscriber,
  ToolConfig,
  ToolIconComponent
} from './config'
export { LONG_TEXT_THRESHOLD, TEXT_FIELD_CONFIG } from './config'

// Context types
export type { MessageInputContextValue } from './context'
