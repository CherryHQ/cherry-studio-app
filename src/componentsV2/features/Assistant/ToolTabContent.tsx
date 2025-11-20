import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { MotiView } from 'moti'
import React, { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'
import * as DropdownMenu from 'zeego/dropdown-menu'

import { Group, McpServerSheet, Row, WebsearchSheet } from '@/componentsV2'
import Text from '@/componentsV2/base/Text'
import { ChevronsUpDown, Globe, SquareFunction, WebsearchProviderIcon, Wrench } from '@/componentsV2/icons'
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
  const websearchSheetRef = useRef<BottomSheetModal>(null)
  const mcpServerSheetRef = useRef<BottomSheetModal>(null)
  const { apiProviders } = useWebsearchProviders()
  const { activeMcpServers } = useActiveMcpServers()

  // Calculate active MCP count based on real-time active MCP servers
  const activeMcpCount = useMemo(() => {
    const assistantMcpIds = assistant.mcpServers?.map(mcp => mcp.id) ?? []
    return activeMcpServers.filter(mcp => assistantMcpIds.includes(mcp.id)).length
  }, [assistant.mcpServers, activeMcpServers])

  const handleToolUseModeToggle = async (mode: 'function' | 'prompt') => {
    const newToolUseMode = mode === assistant.settings?.toolUseMode ? undefined : mode
    await updateAssistant({
      ...assistant,
      settings: {
        ...assistant.settings,
        toolUseMode: newToolUseMode
      }
    })
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
      <Group>
        <Row>
          <Text className="text-sm font-medium">{t('assistants.settings.tooluse.title')}</Text>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Pressable className="bg-ui-card-background flex-row items-center gap-2 rounded-xl  active:opacity-80">
                {assistant.settings?.toolUseMode ? (
                  <>
                    {assistant.settings.toolUseMode === 'function' ? (
                      <SquareFunction className="text-text-secondary dark:text-text-secondary" size={18} />
                    ) : (
                      <Wrench className="text-text-secondary dark:text-text-secondary" size={18} />
                    )}
                    <Text className="text-text-secondary text-sm" numberOfLines={1}>
                      {t(`assistants.settings.tooluse.${assistant.settings?.toolUseMode}`)}
                    </Text>
                  </>
                ) : (
                  <Text className="text-text-secondary text-sm" numberOfLines={1}>
                    {t('assistants.settings.tooluse.empty')}
                  </Text>
                )}
                <ChevronsUpDown size={16} className="text-text-secondary dark:text-text-secondary" />
              </Pressable>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content>
              <DropdownMenu.CheckboxItem
                key="function"
                value={assistant.settings?.toolUseMode === 'function' ? 'on' : 'off'}
                onValueChange={() => handleToolUseModeToggle('function')}>
                <DropdownMenu.ItemIcon>
                  <SquareFunction size={20} />
                </DropdownMenu.ItemIcon>
                <DropdownMenu.ItemTitle>{t('assistants.settings.tooluse.function')}</DropdownMenu.ItemTitle>
                <DropdownMenu.ItemIndicator />
              </DropdownMenu.CheckboxItem>

              <DropdownMenu.CheckboxItem
                key="prompt"
                value={assistant.settings?.toolUseMode === 'prompt' ? 'on' : 'off'}
                onValueChange={() => handleToolUseModeToggle('prompt')}>
                <DropdownMenu.ItemIcon>
                  <Wrench size={20} />
                </DropdownMenu.ItemIcon>
                <DropdownMenu.ItemTitle>{t('assistants.settings.tooluse.prompt')}</DropdownMenu.ItemTitle>
                <DropdownMenu.ItemIndicator />
              </DropdownMenu.CheckboxItem>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Row>

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
      </Group>
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
