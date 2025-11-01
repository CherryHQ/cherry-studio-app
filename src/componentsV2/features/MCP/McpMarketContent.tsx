import { LegendList } from '@legendapp/list'
import type { FC } from 'react'
import React from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import YStack from '@/componentsV2/layout/YStack'
import type { MCPServer } from '@/types/mcp'

import { McpItemCard } from './McpItemCard'

interface McpMarketContentProps {
  mcps: MCPServer[]
  updateMcpServers: (mcps: MCPServer[]) => Promise<void>
  handleMcpServerItemPress: (mcp: MCPServer) => void
}

export const McpMarketContent: FC<McpMarketContentProps> = ({ mcps, updateMcpServers, handleMcpServerItemPress }) => {
  const insets = useSafeAreaInsets()

  return (
    <YStack className="flex-1">
      <LegendList
        data={mcps}
        renderItem={({ item }) => (
          <McpItemCard
            mcp={item}
            updateMcpServers={updateMcpServers}
            handleMcpServerItemPress={handleMcpServerItemPress}
          />
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
