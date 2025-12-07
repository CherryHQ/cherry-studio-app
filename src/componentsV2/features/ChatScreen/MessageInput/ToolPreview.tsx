import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { Globe, Palette, X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import { isGenerateImageModel } from '@/config/models/vision'
import { isWebSearchModel } from '@/config/models/websearch'
import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

const logger = loggerService.withContext('ToolPreview')

type ToolKey = 'enableGenerateImage' | 'enableWebSearch'

interface ToolPreviewProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

const TOOL_DEFINITIONS: Record<ToolKey, { icon: React.ComponentType<{ size: number; className: string }>; labelKey: string }> = {
  enableGenerateImage: {
    icon: Palette,
    labelKey: 'common.generateImage'
  },
  enableWebSearch: {
    icon: Globe,
    labelKey: 'common.websearch'
  }
}

export const getEnabledToolKeys = (assistant: Assistant): ToolKey[] => {
  const { model, enableGenerateImage, enableWebSearch, settings, webSearchProviderId } = assistant
  if (!model) return []

  const enabledTools: ToolKey[] = []
  if ((enableGenerateImage ?? false) && isGenerateImageModel(model)) {
    enabledTools.push('enableGenerateImage')
  }

  if (
    (enableWebSearch ?? false) &&
    (isWebSearchModel(model) || (!!settings?.toolUseMode && !!webSearchProviderId))
  ) {
    enabledTools.push('enableWebSearch')
  }

  return enabledTools
}

// 工具项组件
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

  // 通用切换处理函数
  const handleToggleTool = useCallback(
    async (toolKey: keyof Assistant) => {
      try {
        await updateAssistant({
          ...assistant,
          [toolKey]: !assistant[toolKey]
        })
      } catch (error) {
        logger.error(`handleToggle${toolKey}`, error as Error)
      }
    },
    [assistant, updateAssistant]
  )

  const enabledToolKeys = useMemo(() => getEnabledToolKeys(assistant), [assistant])

  if (enabledToolKeys.length === 0) {
    return null
  }

  return (
    <XStack className="gap-2">
      {enabledToolKeys.map(key => {
        const { icon, labelKey } = TOOL_DEFINITIONS[key]
        const label = t(labelKey)
        return <ToolItem key={key} icon={icon} label={label} onToggle={() => handleToggleTool(key)} />
      })}
    </XStack>
  )
}
