import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { MotiView } from 'moti'
import React, { useRef } from 'react'
import { Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'

import { SquareFunction, Wrench, WebsearchProviderIcon, Globe } from '@/componentsV2/icons'
import { useWebsearchProviders } from '@/hooks/useWebsearchProviders'
import { Assistant } from '@/types/assistant'
import YStack from '@/componentsV2/layout/YStack'
import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import { WebsearchSheet } from '../Sheet/WebsearchSheet'
import { ToolUseSheet } from '../Sheet/ToolUseSheet'
import { McpServerSheet } from '../Sheet/McpServerSheet'

interface ToolTabContentProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export function ToolTabContent({ assistant, updateAssistant }: ToolTabContentProps) {
  const { t } = useTranslation()
  const toolUseSheetRef = useRef<BottomSheetModal>(null)
  const websearchSheetRef = useRef<BottomSheetModal>(null)
  const mcpServerSheetRef = useRef<BottomSheetModal>(null)
  const { apiProviders } = useWebsearchProviders()

  const handleToolUsePress = () => {
    toolUseSheetRef.current?.present()
  }

  const handleWebsearchPress = () => {
    websearchSheetRef.current?.present()
  }

  const handleMcpServerPress = () => {
    mcpServerSheetRef.current?.present()
  }

  const provider = apiProviders.find(p => p.id === assistant.webSearchProviderId)

  const getWebsearchDisplayContent = () => {
    if (provider) {
      return {
        icon: <WebsearchProviderIcon provider={provider} />,
        text: provider.name,
        isActive: true
      }
    }

    if (assistant.webSearchProviderId === 'builtin') {
      return {
        icon: <Globe size={20} />,
        text: t('settings.websearch.builtin'),
        isActive: true
      }
    }

    return {
      icon: null,
      text: t('settings.websearch.empty.label'),
      isActive: false
    }
  }

  const websearchContent = getWebsearchDisplayContent()

  return (
    <MotiView
      style={{ flex: 1 }}
      from={{ opacity: 0, translateY: 10 }}
      animate={{
        translateY: 0,
        opacity: 1
      }}
      exit={{ opacity: 1, translateY: -10 }}
      transition={{
        type: 'timing'
      }}>
      <YStack className="flex-1 gap-4">
        <YStack className="w-full gap-2">
          <Text className="text-sm font-medium text-text-secondary dark:text-text-secondary">
            {t('assistants.settings.tooluse.title')}
          </Text>
          <Pressable
            onPress={handleToolUsePress}
            className="flex-row items-center justify-between rounded-lg bg-ui-card-background px-3 py-3 active:opacity-80 dark:bg-ui-card-background-dark">
            <XStack className="flex-1 items-center gap-2">
              {assistant.settings?.toolUseMode ? (
                <XStack className="flex-1 items-center gap-2">
                  {assistant.settings.toolUseMode === 'function' ? <SquareFunction size={20} /> : <Wrench size={20} />}
                  <Text className="flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
                    {t(`assistants.settings.tooluse.${assistant.settings?.toolUseMode}`)}
                  </Text>
                </XStack>
              ) : (
                <Text
                  className="flex-1 text-base text-text-secondary dark:text-text-secondary"
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {t('assistants.settings.tooluse.empty')}
                </Text>
              )}
            </XStack>
            <RowRightArrow />
          </Pressable>
        </YStack>

        <YStack className="w-full gap-2">
          <Text className="text-sm font-medium text-text-secondary dark:text-text-secondary">
            {t('settings.websearch.provider.title')}
          </Text>
          <Pressable
            onPress={handleWebsearchPress}
            className="flex-row items-center justify-between rounded-lg bg-ui-card-background px-3 py-3 active:opacity-80 dark:bg-ui-card-background-dark">
            <XStack className="flex-1 items-center gap-2">
              {websearchContent.isActive ? (
                <XStack className="max-w-[80%] flex-1 items-center gap-2">
                  <XStack className="items-center justify-center">{websearchContent.icon}</XStack>
                  <Text className="flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
                    {websearchContent.text}
                  </Text>
                </XStack>
              ) : (
                <Text
                  className="flex-1 text-base text-text-secondary dark:text-text-secondary"
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {websearchContent.text}
                </Text>
              )}
            </XStack>
            <RowRightArrow />
          </Pressable>
        </YStack>

        <YStack className="w-full gap-2">
          <Text className="text-sm font-medium text-text-secondary dark:text-text-secondary">
            {t('mcp.server.title')}
          </Text>
          <Pressable
            onPress={handleMcpServerPress}
            className="flex-row items-center justify-between rounded-lg bg-ui-card-background px-3 py-3 active:opacity-80 dark:bg-ui-card-background-dark">
            <XStack className="flex-1 items-center gap-2">
              {assistant.mcpServers && assistant.mcpServers.length > 0 ? (
                <Text>{t('mcp.server.selected', { num: assistant.mcpServers.length })}</Text>
              ) : (
                <Text
                  className="flex-1 text-base text-text-secondary dark:text-text-secondary"
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {t('mcp.server.empty')}
                </Text>
              )}
            </XStack>
            <RowRightArrow />
          </Pressable>
        </YStack>
      </YStack>
      <ToolUseSheet ref={toolUseSheetRef} assistant={assistant} updateAssistant={updateAssistant} />
      <WebsearchSheet
        ref={websearchSheetRef}
        assistant={assistant}
        updateAssistant={updateAssistant}
        providers={apiProviders.filter(p => p.apiKey)}
      />
      <McpServerSheet ref={mcpServerSheetRef} assistant={assistant} updateAssistant={updateAssistant} />
    </MotiView>
  )
}
