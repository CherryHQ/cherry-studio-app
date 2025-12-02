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

// 工具配置类型
interface ToolConfig {
  key: keyof Assistant
  label: string
  icon: React.ComponentType<{ size: number; className: string }>
  enabled: boolean
}

interface ToolPreviewProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

// 工具项组件
interface ToolItemProps {
  icon: React.ComponentType<{ size: number; className: string }>
  label: string
  onToggle: () => void
}

const ToolItem: React.FC<ToolItemProps> = ({ icon: Icon, label, onToggle }) => (
  <XStack className="bg-green-10 border-green-20 items-center justify-between gap-1 rounded-full border-[0.5px] px-2 py-1">
    <Icon size={20} className="text-green-100" />
    <Text className="text-green-100">{label}</Text>
    <Pressable onPress={onToggle}>
      <X size={20} className="text-green-100" />
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

  // 工具配置数组
  const toolConfigs = useMemo((): ToolConfig[] => {
    const { model } = assistant
    return [
      {
        key: 'enableGenerateImage',
        label: t('common.generateImage'),
        icon: Palette,
        enabled: (assistant.enableGenerateImage ?? false) && (model ? isGenerateImageModel(model) : false)
      },
      {
        key: 'enableWebSearch',
        label: t('common.websearch'),
        icon: Globe,
        enabled:
          (assistant.enableWebSearch ?? false) &&
          !!model &&
          (isWebSearchModel(model) || (!!assistant.settings?.toolUseMode && !!assistant.webSearchProviderId))
      }
    ]
  }, [assistant, t])

  // 如果没有模型，不显示任何工具
  if (!assistant.model) {
    return null
  }

  // 过滤出已启用的工具
  const enabledTools = toolConfigs.filter(config => config.enabled)

  // 如果没有启用的工具，不渲染任何内容
  if (enabledTools.length === 0) {
    return null
  }

  return (
    <XStack className="gap-2">
      {enabledTools.map(({ key, icon, label }) => (
        <ToolItem key={key} icon={icon} label={label} onToggle={() => handleToggleTool(key)} />
      ))}
    </XStack>
  )
}
