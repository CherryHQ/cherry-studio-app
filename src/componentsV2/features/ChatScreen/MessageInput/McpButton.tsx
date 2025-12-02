import React, { useMemo } from 'react'
import { Keyboard } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import Text from '@/componentsV2/base/Text'
import { Hammer } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import { useActiveMcpServers } from '@/hooks/useMcp'
import type { Assistant } from '@/types/assistant'

import { presentMcpServerSheet } from '../../Sheet/McpServerSheet'

interface McpButtonProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const McpButton: React.FC<McpButtonProps> = ({ assistant, updateAssistant }) => {
  const { activeMcpServers } = useActiveMcpServers()

  const openMcpServerSheet = () => {
    Keyboard.dismiss()
    presentMcpServerSheet({
      assistant,
      updateAssistant
    })
  }

  // Calculate active MCP count based on real-time active MCP servers
  const activeMcpCount = useMemo(() => {
    const assistantMcpIds = assistant.mcpServers?.map(mcp => mcp.id) ?? []
    return activeMcpServers.filter(mcp => assistantMcpIds.includes(mcp.id)).length
  }, [assistant.mcpServers, activeMcpServers])

  const McpIconContent = () => {
    if (activeMcpCount > 0) {
      return (
        <XStack className="border-brand-300/30 bg-brand-300/5 items-center justify-between gap-1 rounded-xl border-[0.5px] px-2 py-1">
          <Hammer size={20} className="text-brand-300" />
          <Text className="text-brand-300">{activeMcpCount}</Text>
        </XStack>
      )
    }
    return <Hammer size={20} />
  }

  return <IconButton icon={<McpIconContent />} onPress={openMcpServerSheet} />
}
