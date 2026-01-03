import React from 'react'
import { Keyboard } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import Text from '@/componentsV2/base/Text'
import { Hammer } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import { useActiveMcpServers } from '@/hooks/useMcp'
import type { Assistant } from '@/types/assistant'

import { presentMcpServerSheet } from '../../../Sheet/McpServerSheet'

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
  const assistantMcpIds = assistant.mcpServers?.map(mcp => mcp.id) ?? []
  const activeMcpCount = activeMcpServers.filter(mcp => assistantMcpIds.includes(mcp.id)).length

  const McpIconContent = () => {
    if (activeMcpCount > 0) {
      return (
        <XStack className="message-input-container items-center justify-between gap-1 rounded-xl border-[0.5px] px-2 py-1">
          <Hammer size={20} className="primary-text" />
          <Text className="primary-text">{activeMcpCount}</Text>
        </XStack>
      )
    }
    return <Hammer size={20} />
  }

  return <IconButton icon={<McpIconContent />} onPress={openMcpServerSheet} />
}
