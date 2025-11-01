import React, { useCallback, useMemo } from 'react'
import { Pressable } from 'react-native'

import { Globe, Palette, X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'

const logger = loggerService.withContext('ToolPreview')

// 工具配置类型
interface ToolConfig {
  key: keyof Assistant
  icon: React.ComponentType<{ size: number; className: string }>
  enabled: boolean
}

// 通用样式常量
const TOOL_ITEM_STYLES =
  'gap-1 rounded-xl py-1 px-2 bg-green-10 dark:bg-green-dark-10 border-[0.5px] border-green-20 dark:border-green-dark-20 justify-between items-center'
const ICON_STYLES = 'text-green-100 dark:text-green-dark-100'

interface ToolPreviewProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

// 工具项组件
interface ToolItemProps {
  icon: React.ComponentType<{ size: number; className: string }>
  onToggle: () => void
}

const ToolItem: React.FC<ToolItemProps> = ({ icon: Icon, onToggle }) => (
  <XStack className={TOOL_ITEM_STYLES}>
    <Icon size={20} className={ICON_STYLES} />
    <Pressable onPress={onToggle}>
      <X size={20} className={ICON_STYLES} />
    </Pressable>
  </XStack>
)

export const ToolPreview: React.FC<ToolPreviewProps> = ({ assistant, updateAssistant }) => {
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
  const toolConfigs = useMemo(
    (): ToolConfig[] => [
      {
        key: 'enableGenerateImage',
        icon: Palette,
        enabled: assistant.enableGenerateImage ?? false
      },
      {
        key: 'enableWebSearch',
        icon: Globe,
        enabled: assistant.enableWebSearch ?? false
      }
    ],
    [assistant.enableGenerateImage, assistant.enableWebSearch]
  )

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
      {enabledTools.map(({ key, icon }) => (
        <ToolItem key={key} icon={icon} onToggle={() => handleToggleTool(key)} />
      ))}
    </XStack>
  )
}
