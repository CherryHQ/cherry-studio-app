import { Switch } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import PressableRow from '@/componentsV2/layout/PressableRow'
import YStack from '@/componentsV2/layout/YStack'
import type { MCPServer } from '@/types/mcp'

interface McpItemCardProps {
  mcp: MCPServer
  updateMcpServers: (mcps: MCPServer[]) => Promise<void>
  handleMcpServerItemPress: (mcp: MCPServer) => void
}

export const McpItemCard: FC<McpItemCardProps> = ({ mcp, updateMcpServers, handleMcpServerItemPress }) => {
  const { t } = useTranslation()

  const handlePress = () => {
    handleMcpServerItemPress(mcp)
  }
  const handleSwitchChange = async (value: boolean) => {
    console.log('handleSwitchChange', value)
    await updateMcpServers([{ ...mcp, isActive: value }])
  }

  return (
    <PressableRow
      onPress={handlePress}
      className="bg-ui-card-background items-center justify-between rounded-2xl px-2.5 py-2.5">
      <YStack className="h-full gap-2">
        <Text className="text-lg">{mcp.name}</Text>
        <Text className="text-text-secondary text-sm">{mcp.description}</Text>
      </YStack>
      <YStack className="justify-between gap-2">
        <Switch color="success" isSelected={mcp.isActive} onSelectedChange={handleSwitchChange}>
          <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
        </Switch>

        <Text className="border-green-20 bg-green-10 rounded-lg border-[0.5px] px-2 py-0.5 text-sm text-green-100">
          {t(`mcp.type.${mcp.type}`)}
        </Text>
      </YStack>
    </PressableRow>
  )
}
