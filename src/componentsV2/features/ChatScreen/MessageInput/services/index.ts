// MessageInputService
export type { IMessageInputService } from './MessageInputService'
export { createMessageInputService, getMessageInputService, MessageInputService } from './MessageInputService'

// TextProcessingService
export type { TextProcessingOptions } from './TextProcessingService'
export { isLongText, processInputText } from './TextProcessingService'

// MentionValidationService
export { getInitialMentions, handleModelChange, validateMentions } from './MentionValidationService'

// ToolAvailabilityService
export { getEnabledTools, getToolConfig, isToolEnabled, toggleTool, TOOL_CONFIGS } from './ToolAvailabilityService'
