import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { Check, ChevronsUpDown, Globe, Palette } from '@/componentsV2/icons'
import PressableRow from '@/componentsV2/layout/PressableRow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { isGenerateImageModels, isWebSearchModel } from '@/config/models'
import type { Assistant, Model } from '@/types/assistant'

import type { ExternalToolConfig } from './types'

interface ExternalToolsProps {
  mentions: Model[]
  assistant: Assistant
  onWebSearchToggle: () => void
  onWebSearchSwitchPress?: () => void
  onGenerateImageToggle: () => void
  isLoading?: boolean
}

export const ExternalTools: React.FC<ExternalToolsProps> = ({
  mentions,
  assistant,
  onWebSearchToggle,
  onWebSearchSwitchPress,
  onGenerateImageToggle,
  isLoading = false
}) => {
  const { t } = useTranslation()

  const firstMention = mentions[0]

  const options: ExternalToolConfig[] = [
    {
      key: 'webSearch',
      label: assistant.webSearchProviderId
        ? `${t('common.websearch')}(${t(`settings.websearch.providers.${assistant.webSearchProviderId}`)})`
        : t('common.websearch'),
      icon: <Globe size={20} />,
      onPress: onWebSearchToggle,
      onSwitchPress: onWebSearchSwitchPress,
      isActive: !!assistant.enableWebSearch,
      // 网络搜索模型 && 设置了工具调用 && 设置了网络搜索服务商 才能开启网络搜索
      shouldShow:
        !!firstMention &&
        (isWebSearchModel(firstMention) || (!!assistant.settings?.toolUseMode && !!assistant.webSearchProviderId))
    },
    {
      key: 'generateImage',
      label: t('common.generateImage'),
      icon: <Palette size={20} />,
      onPress: onGenerateImageToggle,
      isActive: !!assistant.enableGenerateImage,
      shouldShow: isGenerateImageModels(mentions)
    }
  ]

  const visibleOptions = options.filter(option => option.shouldShow)

  if (visibleOptions.length === 0) {
    return null
  }

  return (
    <YStack className="px-5">
      {visibleOptions.map(option => {
        const activeColorClass = option.isActive ? 'primary-text' : 'text-foreground'

        return (
          <PressableRow
            key={option.key}
            className="my-1 w-full items-center justify-between rounded-xl px-0 py-2"
            onPress={option.onPress}
            disabled={isLoading}>
            <XStack className="items-center gap-2">
              {isLoading ? (
                <ActivityIndicator size="small" />
              ) : (
                React.cloneElement(option.icon, { className: activeColorClass })
              )}
              <Text className={`text-lg ${activeColorClass}`}>{option.label}</Text>
            </XStack>
            <XStack className="items-center gap-2">
              {option.isActive && !isLoading && <Check size={20} className="primary-text" />}
              {option.onSwitchPress && (
                <Pressable
                  onPress={option.onSwitchPress}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="ml-1 rounded-lg p-1 active:opacity-60"
                  disabled={isLoading}>
                  <ChevronsUpDown size={18} className="text-foreground-secondary" />
                </Pressable>
              )}
            </XStack>
          </PressableRow>
        )
      })}
    </YStack>
  )
}
