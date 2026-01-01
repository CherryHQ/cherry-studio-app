import { LegendList } from '@legendapp/list'
import type { FC } from 'react'
import React from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import YStack from '@/componentsV2/layout/YStack'
import type { MCPServer } from '@/types/mcp'

import { McpItemCard } from './McpItemCard'

interface McpMarketContentProps {
  mcps: MCPServer[]
  handleMcpServerItemPress: (mcp: MCPServer) => void
  mode?: 'add' | 'toggle'
  onToggle?: (mcp: MCPServer, isActive: boolean) => void
}

export const McpMarketContent: FC<McpMarketContentProps> = ({
  mcps,
  handleMcpServerItemPress,
  mode = 'toggle',
  onToggle
}) => {
  const insets = useSafeAreaInsets()

  return (
    <YStack className="flex-1">
      <LegendList
        data={mcps}
        renderItem={({ item }) => (
          <McpItemCard mcp={item} handleMcpServerItemPress={handleMcpServerItemPress} mode={mode} onToggle={onToggle} />
        )}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <YStack className="h-2" />}
        recycleItems
        estimatedItemSize={100}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        drawDistance={2000}
        waitForInitialLayout
      />
    </YStack>
  )
}
