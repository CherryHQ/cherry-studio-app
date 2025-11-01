import SelectionSheet, { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import Text from '@/componentsV2/base/Text'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import { useActiveMcpServers } from '@/hooks/useMcp'
import { Assistant } from '@/types/assistant'
import { DrawerNavigationProps } from '@/types/naviagate'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity } from 'react-native'

interface McpServerProps {
  ref: React.RefObject<BottomSheetModal | null>
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const McpServerSheet: FC<McpServerProps> = ({ ref, assistant, updateAssistant }) => {
  const { activeMcpServers, isLoading } = useActiveMcpServers()
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  if (isLoading) {
    return null
  }

  const handleNavigateToMcpMarket = () => {
    ref.current?.dismiss()
    navigation.navigate('Mcp', { screen: 'McpMarketScreen' })
  }

  const providerItems: SelectionSheetItem[] = activeMcpServers.map(mcpServer => {
    return {
      id: mcpServer.id,
      label: mcpServer.name,
      isSelected: !!assistant.mcpServers?.find(s => s.id === mcpServer.id),
      onSelect: async () => {
        const currentMcpServers = assistant.mcpServers || []
        const exists = currentMcpServers.some(s => s.id === mcpServer.id)

        const updatedMcpServers = exists
          ? currentMcpServers.filter(s => s.id !== mcpServer.id)
          : [...currentMcpServers, mcpServer]

        await updateAssistant({ ...assistant, mcpServers: updatedMcpServers })
      }
    }
  })

  const emptyContent = (
    <TouchableOpacity onPress={handleNavigateToMcpMarket} activeOpacity={0.7}>
      <XStack className="bg-card w-full items-center gap-2.5 rounded-md px-5 py-4 dark:bg-ui-card-dark">
        <Text className="flex-1 text-base text-foreground">{t('settings.websearch.empty.label')}</Text>
        <XStack className="items-center gap-1.5">
          <Text className="text-[11px] opacity-40">{t('settings.websearch.empty.description')}</Text>
          <RowRightArrow />
        </XStack>
      </XStack>
    </TouchableOpacity>
  )

  return <SelectionSheet items={providerItems} ref={ref} emptyContent={emptyContent} shouldDismiss={false} />
}
