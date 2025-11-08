import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { MotiView } from 'moti'
import React, { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { McpServerSheet, ToolUseSheet, WebsearchSheet } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import { Globe, SquareFunction, WebsearchProviderIcon, Wrench } from '@/componentsV2/icons'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useActiveMcpServers } from '@/hooks/useMcp'
import { useWebsearchProviders } from '@/hooks/useWebsearchProviders'
import type { Assistant } from '@/types/assistant'

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
  const { activeMcpServers } = useActiveMcpServers()

  // Calculate active MCP count based on real-time active MCP servers
  const activeMcpCount = useMemo(() => {
    const assistantMcpIds = assistant.mcpServers?.map(mcp => mcp.id) ?? []
    return activeMcpServers.filter(mcp => assistantMcpIds.includes(mcp.id)).length
  }, [assistant.mcpServers, activeMcpServers])

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
          <Text className="text-text-secondary text-sm font-medium">{t('assistants.settings.tooluse.title')}</Text>
          <Pressable
            onPress={handleToolUsePress}
            className="bg-ui-card-background flex-row items-center justify-between rounded-xl px-3 py-3 active:opacity-80">
            <XStack className="flex-1 items-center gap-2">
              {assistant.settings?.toolUseMode ? (
                <XStack className="flex-1 items-center gap-2">
                  {assistant.settings.toolUseMode === 'function' ? <SquareFunction size={20} /> : <Wrench size={20} />}
                  <Text className="flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
                    {t(`assistants.settings.tooluse.${assistant.settings?.toolUseMode}`)}
                  </Text>
                </XStack>
              ) : (
                <Text className="text-text-secondary flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
                  {t('assistants.settings.tooluse.empty')}
                </Text>
              )}
            </XStack>
            <RowRightArrow />
          </Pressable>
        </YStack>

        <YStack className="w-full gap-2">
          <Text className="text-text-secondary text-sm font-medium">{t('settings.websearch.provider.title')}</Text>
          <Pressable
            onPress={handleWebsearchPress}
            className="bg-ui-card-background flex-row items-center justify-between rounded-xl px-3 py-3 active:opacity-80">
            <XStack className="flex-1 items-center gap-2">
              {websearchContent.isActive ? (
                <XStack className="max-w-[80%] flex-1 items-center gap-2">
                  <XStack className="items-center justify-center">{websearchContent.icon}</XStack>
                  <Text className="flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
                    {websearchContent.text}
                  </Text>
                </XStack>
              ) : (
                <Text className="text-text-secondary flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
                  {websearchContent.text}
                </Text>
              )}
            </XStack>
            <RowRightArrow />
          </Pressable>
        </YStack>

        <YStack className="w-full gap-2">
          <Text className="text-text-secondary text-sm font-medium">{t('mcp.server.title')}</Text>
          <Pressable
            onPress={handleMcpServerPress}
            className="bg-ui-card-background flex-row items-center justify-between rounded-xl px-3 py-3 active:opacity-80">
            <XStack className="flex-1 items-center gap-2">
              {activeMcpCount > 0 ? (
                <Text>{t('mcp.server.selected', { num: activeMcpCount })}</Text>
              ) : (
                <Text className="text-text-secondary flex-1 text-base" numberOfLines={1} ellipsizeMode="tail">
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
