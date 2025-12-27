import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import Text from '@/componentsV2/base/Text'
import { ChevronRight, TriangleAlert } from '@/componentsV2/icons'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import { useActiveMcpServers } from '@/hooks/useMcp'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

const SHEET_NAME = 'global-mcp-server-sheet'

interface McpServerSheetData {
  assistant: Assistant | null
  updateAssistant: ((assistant: Assistant) => Promise<void>) | null
}

const defaultMcpServerData: McpServerSheetData = {
  assistant: null,
  updateAssistant: null
}

let currentSheetData: McpServerSheetData = defaultMcpServerData
let updateSheetDataCallback: ((data: McpServerSheetData) => void) | null = null

export const presentMcpServerSheet = (data: McpServerSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissMcpServerSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const McpServerSheet: React.FC = () => {
  const [sheetData, setSheetData] = useState<McpServerSheetData>(currentSheetData)
  const { assistant, updateAssistant } = sheetData
  const { activeMcpServers, isLoading } = useActiveMcpServers()
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>(
    () => assistant?.mcpServers?.map(server => server.id) ?? []
  )

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  useEffect(() => {
    if (!assistant) {
      setSelectedMcpIds([])
      return
    }
    setSelectedMcpIds(assistant.mcpServers?.map(server => server.id) ?? [])
  }, [assistant])

  const handleToggleMcpServer = async (mcpServerId: string) => {
    if (!assistant || !updateAssistant) {
      return
    }
    const activeMcpIds = new Set(activeMcpServers.map(server => server.id))
    const validSelectedIds = selectedMcpIds.filter(id => activeMcpIds.has(id))
    const exists = validSelectedIds.includes(mcpServerId)
    const updatedIds = exists ? validSelectedIds.filter(id => id !== mcpServerId) : [...validSelectedIds, mcpServerId]

    setSelectedMcpIds(updatedIds)

    const updatedMcpServers = activeMcpServers.filter(server => updatedIds.includes(server.id))
    await updateAssistant({ ...assistant, mcpServers: updatedMcpServers })
  }

  if (isLoading || !assistant || !updateAssistant) {
    return <SelectionSheet name={SHEET_NAME} detents={['auto', 0.5]} items={[]} shouldDismiss={false} />
  }

  const handleNavigateToMcpMarket = () => {
    dismissMcpServerSheet()
    navigation.navigate('Mcp', { screen: 'McpMarketScreen' })
  }

  const handleNavigateToToolTab = () => {
    dismissMcpServerSheet()
    navigation.navigate('Assistant', {
      screen: 'AssistantDetailScreen',
      params: { assistantId: assistant.id, tab: 'tool' }
    })
  }

  const providerItems: SelectionSheetItem[] = activeMcpServers.map(mcpServer => {
    return {
      id: mcpServer.id,
      label: mcpServer.name,
      isSelected: selectedMcpIds.includes(mcpServer.id),
      onSelect: () => handleToggleMcpServer(mcpServer.id)
    }
  })

  const warningContent = !assistant.settings?.toolUseMode ? (
    <Pressable onPress={handleNavigateToToolTab} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack className="w-full items-center gap-2.5 rounded-lg bg-orange-400/10 px-3.5 py-3">
        <TriangleAlert size={20} className="text-orange-400 " />
        <Text className="flex-1 text-sm text-orange-400">{t('assistants.settings.tooluse.empty')}</Text>
        <ChevronRight size={20} className="text-orange-400" />
      </XStack>
    </Pressable>
  ) : null

  const emptyContent = (
    <Pressable onPress={handleNavigateToMcpMarket} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack className="w-full items-center gap-2.5 rounded-lg bg-zinc-400/10 px-3.5 py-3">
        <Text className="text-foreground flex-1 text-base">{t('settings.websearch.empty.label')}</Text>
        <XStack className="items-center gap-1.5">
          <Text className="text-sm opacity-40">{t('settings.websearch.empty.description')}</Text>
          <RowRightArrow />
        </XStack>
      </XStack>
    </Pressable>
  )

  return (
    <SelectionSheet
      name={SHEET_NAME}
      detents={['auto', 0.5]}
      items={providerItems}
      emptyContent={emptyContent}
      headerComponent={warningContent}
      shouldDismiss={false}
    />
  )
}
