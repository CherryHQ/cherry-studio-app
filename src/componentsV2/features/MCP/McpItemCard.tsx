import { Button, Switch } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import { Plus } from '@/componentsV2/icons/LucideIcon'
import PressableRow from '@/componentsV2/layout/PressableRow'
import YStack from '@/componentsV2/layout/YStack'
import { useToast } from '@/hooks/useToast'
import { mcpService } from '@/services/McpService'
import type { MCPServer } from '@/types/mcp'

interface McpItemCardProps {
  mcp: MCPServer
  handleMcpServerItemPress: (mcp: MCPServer) => void
  mode?: 'add' | 'toggle'
  onToggle?: (mcp: MCPServer, isActive: boolean) => void
}

export const McpItemCard: FC<McpItemCardProps> = ({ mcp, handleMcpServerItemPress, mode = 'toggle', onToggle }) => {
  const { t } = useTranslation()
  const toast = useToast()

  const handlePress = () => {
    handleMcpServerItemPress(mcp)
  }

  const handleAddMcp = async () => {
    await mcpService.createMcpServer({
      ...mcp,
      isActive: true
    })
    toast.show(t('mcp.market.add.success', { mcp_name: mcp.name }))
  }

  const handleSwitchChange = (value: boolean) => {
    onToggle?.(mcp, value)
  }

  return (
    <PressableRow
      onPress={handlePress}
      className="bg-card items-center justify-between gap-2 rounded-2xl px-2.5 py-2.5">
      <YStack className="h-full flex-1 gap-2">
        <Text className="text-lg">{mcp.name}</Text>
        <Text className="text-foreground-secondary text-sm" numberOfLines={1} ellipsizeMode="tail">
          {mcp.description}
        </Text>
      </YStack>
      <YStack className="items-end justify-between gap-2">
        {mode === 'add' ? (
          <Button size="sm" variant="ghost" isIconOnly onPress={handleAddMcp}>
            <Button.Label>
              <Plus size={24} />
            </Button.Label>
          </Button>
        ) : (
          <Switch isSelected={mcp.isActive} onSelectedChange={handleSwitchChange} />
        )}
        <Text className="primary-badge rounded-lg border-[0.5px] px-2 py-0.5 text-sm">{t(`mcp.type.${mcp.type}`)}</Text>
      </YStack>
    </PressableRow>
  )
}
