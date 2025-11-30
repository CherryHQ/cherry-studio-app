import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity } from 'react-native'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import Text from '@/componentsV2/base/Text'
import { ChevronRight, TriangleAlert } from '@/componentsV2/icons'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import { useActiveMcpServers } from '@/hooks/useMcp'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface McpServerProps {
  name: string
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const presentMcpServerSheet = (name: string) => TrueSheet.present(name)
export const dismissMcpServerSheet = (name: string) => TrueSheet.dismiss(name)

export const McpServerSheet: FC<McpServerProps> = ({ name, assistant, updateAssistant }) => {
  const { activeMcpServers, isLoading } = useActiveMcpServers()
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  if (isLoading) {
    return null
  }

  const handleNavigateToMcpMarket = () => {
    TrueSheet.dismiss(name)
    navigation.navigate('Mcp', { screen: 'McpMarketScreen' })
  }

  const handleNavigateToToolTab = () => {
    TrueSheet.dismiss(name)
    navigation.navigate('Assistant', {
      screen: 'AssistantDetailScreen',
      params: { assistantId: assistant.id, tab: 'tool' }
    })
  }

  const providerItems: SelectionSheetItem[] = activeMcpServers.map(mcpServer => {
    return {
      id: mcpServer.id,
      label: mcpServer.name,
      isSelected: !!assistant.mcpServers?.find(s => s.id === mcpServer.id),
      onSelect: async () => {
        // Filter out inactive MCPs to keep data consistent
        const activeMcpIds = new Set(activeMcpServers.map(s => s.id))
        const currentMcpServers = (assistant.mcpServers || []).filter(s => activeMcpIds.has(s.id))
        const exists = currentMcpServers.some(s => s.id === mcpServer.id)

        const updatedMcpServers = exists
          ? currentMcpServers.filter(s => s.id !== mcpServer.id)
          : [...currentMcpServers, mcpServer]

        await updateAssistant({ ...assistant, mcpServers: updatedMcpServers })
      }
    }
  })

  const warningContent = !assistant.settings?.toolUseMode ? (
    <TouchableOpacity onPress={handleNavigateToToolTab} activeOpacity={0.7}>
      <XStack className="bg-orange-10 w-full items-center gap-2.5 rounded-lg px-3.5 py-3">
        <TriangleAlert size={20} className="text-orange-100 " />
        <Text className="flex-1 text-sm text-orange-100">{t('assistants.settings.tooluse.empty')}</Text>
        <ChevronRight size={20} className="text-orange-100" />
      </XStack>
    </TouchableOpacity>
  ) : null

  const emptyContent = (
    <TouchableOpacity onPress={handleNavigateToMcpMarket} activeOpacity={0.7}>
      <XStack className="bg-gray-10 w-full items-center gap-2.5 rounded-lg px-3.5 py-3">
        <Text className="text-foreground flex-1 text-base">{t('settings.websearch.empty.label')}</Text>
        <XStack className="items-center gap-1.5">
          <Text className="text-sm opacity-40">{t('settings.websearch.empty.description')}</Text>
          <RowRightArrow />
        </XStack>
      </XStack>
    </TouchableOpacity>
  )

  return (
    <SelectionSheet
      name={name}
      items={providerItems}
      emptyContent={emptyContent}
      headerComponent={warningContent}
      shouldDismiss={false}
    />
  )
}
