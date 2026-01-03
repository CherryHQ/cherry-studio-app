import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

import { getEnabledTools, toggleTool, TOOL_CONFIGS } from '../services'
import type { AssistantToolKey } from '../types'

const logger = loggerService.withContext('ToolPreview')

interface ToolPreviewProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

interface ToolItemProps {
  icon: React.ComponentType<{ size: number; className: string }>
  label: string
  onToggle: () => void
}

const ToolItem: React.FC<ToolItemProps> = ({ icon: Icon, label, onToggle }) => (
  <XStack className="message-input-container items-center justify-between gap-1 rounded-full border px-2 py-1">
    <Icon size={20} className="primary-text" />
    <Text className="primary-text">{label}</Text>
    <Pressable onPress={onToggle}>
      <X size={20} className="primary-text" />
    </Pressable>
  </XStack>
)

export const ToolPreview: React.FC<ToolPreviewProps> = ({ assistant, updateAssistant }) => {
  const { t } = useTranslation()

  // Type-safe tool handling using service
  const handleToggleTool = async (toolKey: AssistantToolKey) => {
    const result = await toggleTool(toolKey, assistant, updateAssistant)
    if (!result.success) {
      logger.error(`Failed to toggle ${toolKey}`, result.error)
    }
  }

  const enabledToolKeys = getEnabledTools(assistant)

  if (enabledToolKeys.length === 0) {
    return null
  }

  return (
    <XStack className="gap-2">
      {enabledToolKeys.map(key => {
        const config = TOOL_CONFIGS[key]
        const label = t(config.labelKey)
        return <ToolItem key={key} icon={config.icon} label={label} onToggle={() => handleToggleTool(key)} />
      })}
    </XStack>
  )
}

// Re-export getEnabledToolKeys for backward compatibility
export { getEnabledTools as getEnabledToolKeys } from '../services'
