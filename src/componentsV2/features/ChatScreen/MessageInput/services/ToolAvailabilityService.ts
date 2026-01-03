import { Globe, Palette } from '@/componentsV2/icons/LucideIcon'
import { isGenerateImageModel } from '@/config/models/vision'
import { isWebSearchModel } from '@/config/models/websearch'
import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

import type { AssistantToolKey, MessageInputResult, ToolConfig, ToolIconComponent } from '../types'
import { createErrorResult, createSuccessResult } from '../types'

const logger = loggerService.withContext('ToolAvailabilityService')

/**
 * Tool configurations with availability check functions
 */
export const TOOL_CONFIGS: Record<AssistantToolKey, Omit<ToolConfig, 'key'>> = {
  enableGenerateImage: {
    icon: Palette as ToolIconComponent,
    labelKey: 'common.generateImage',
    isEnabled: (assistant: Assistant) => {
      const { model, enableGenerateImage } = assistant
      return Boolean(model && enableGenerateImage && isGenerateImageModel(model))
    }
  },
  enableWebSearch: {
    icon: Globe as ToolIconComponent,
    labelKey: 'common.websearch',
    isEnabled: (assistant: Assistant) => {
      const { model, enableWebSearch, settings, webSearchProviderId } = assistant
      return Boolean(
        model && enableWebSearch && (isWebSearchModel(model) || (!!settings?.toolUseMode && !!webSearchProviderId))
      )
    }
  }
}

/**
 * Get list of enabled tool keys for an assistant
 */
export function getEnabledTools(assistant: Assistant): AssistantToolKey[] {
  return (Object.keys(TOOL_CONFIGS) as AssistantToolKey[]).filter(key => TOOL_CONFIGS[key].isEnabled(assistant))
}

/**
 * Check if a specific tool is enabled
 */
export function isToolEnabled(toolKey: AssistantToolKey, assistant: Assistant): boolean {
  return TOOL_CONFIGS[toolKey].isEnabled(assistant)
}

/**
 * Get tool config by key
 */
export function getToolConfig(toolKey: AssistantToolKey): ToolConfig {
  return {
    key: toolKey,
    ...TOOL_CONFIGS[toolKey]
  }
}

/**
 * Toggle a tool on/off for an assistant
 */
export async function toggleTool(
  toolKey: AssistantToolKey,
  assistant: Assistant,
  updateAssistant: (assistant: Assistant) => Promise<void>
): Promise<MessageInputResult> {
  try {
    await updateAssistant({
      ...assistant,
      [toolKey]: !assistant[toolKey]
    })
    return createSuccessResult()
  } catch (error) {
    logger.error(`Failed to toggle ${toolKey}`, error)
    return createErrorResult(
      'general',
      error instanceof Error ? error.message : 'Unknown error',
      'error.tool.toggle_failed'
    )
  }
}
