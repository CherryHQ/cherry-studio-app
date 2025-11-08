import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import { Check, Globe, Palette } from '@/componentsV2/icons'
import PressableRow from '@/componentsV2/layout/PressableRow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { isGenerateImageModels, isWebSearchModel } from '@/config/models'
import type { Assistant, Model } from '@/types/assistant'

interface ExternalTool {
  key: string
  label: string
  icon: React.ReactElement
  onPress: () => void
  isActive: boolean
  shouldShow: boolean
}

interface ExternalToolsProps {
  mentions: Model[]
  assistant: Assistant
  onWebSearchToggle: () => void
  onGenerateImageToggle: () => void
}

export const ExternalTools: React.FC<ExternalToolsProps> = ({
  mentions,
  assistant,
  onWebSearchToggle,
  onGenerateImageToggle
}) => {
  const { t } = useTranslation()

  const firstMention = mentions[0]

  const options: ExternalTool[] = [
    {
      key: 'webSearch',
      label: t('common.websearch'),
      icon: <Globe size={20} />,
      onPress: onWebSearchToggle,
      isActive: !!assistant.enableWebSearch,
      // 网络搜索模型 && 设置了工具调用 && 设置了网络搜索服务商 才能开启网络搜索
      shouldShow:
        !!firstMention &&
        (isWebSearchModel(firstMention) || (!!assistant.settings?.toolUseMode && !!assistant.webSearchProviderId))
      // shouldShow: true
    },
    {
      key: 'generateImage',
      label: t('common.generateImage'),
      icon: <Palette size={20} />,
      onPress: onGenerateImageToggle,
      isActive: !!assistant.enableGenerateImage,
      shouldShow: isGenerateImageModels(mentions)
      // shouldShow: true
    }
  ]

  const visibleOptions = options.filter(option => option.shouldShow)

  if (visibleOptions.length === 0) {
    return null
  }

  return (
    <YStack className="px-5">
      {visibleOptions.map(option => {
        const activeColorClass = option.isActive ? 'text-green-100' : 'text-text-primary'

        return (
          <PressableRow
            key={option.key}
            className="my-1 w-full items-center justify-between rounded-xl px-0 py-2"
            onPress={option.onPress}>
            <XStack className="gap-5">
              {React.cloneElement(option.icon, { className: activeColorClass } as any)}
              <Text className={`text-base ${activeColorClass}`}>{option.label}</Text>
            </XStack>
            {option.isActive && <Check size={20} className="text-green-100" />}
          </PressableRow>
        )
      })}
    </YStack>
  )
}
