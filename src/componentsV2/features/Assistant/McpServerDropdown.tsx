import { useNavigation } from '@react-navigation/native'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import SelectionDropdown, { type SelectionDropdownItem } from '@/componentsV2/base/SelectionDropdown'
import Text from '@/componentsV2/base/Text'
import { ChevronRight, ChevronsUpDown } from '@/componentsV2/icons'
import { useActiveMcpServers } from '@/hooks/useMcp'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface McpServerDropdownProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export function McpServerDropdown({ assistant, updateAssistant }: McpServerDropdownProps) {
  const { t } = useTranslation()
  const { activeMcpServers, isLoading } = useActiveMcpServers()
  const navigation = useNavigation<DrawerNavigationProps>()

  // Calculate active MCP count based on real-time active MCP servers
  const activeMcpCount = useMemo(() => {
    const assistantMcpIds = assistant.mcpServers?.map(mcp => mcp.id) ?? []
    return activeMcpServers.filter(mcp => assistantMcpIds.includes(mcp.id)).length
  }, [assistant.mcpServers, activeMcpServers])

  if (isLoading) {
    return null
  }

  const mcpOptions: SelectionDropdownItem[] = activeMcpServers.map(mcpServer => {
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

  // If no MCP servers available, show a pressable that navigates to MCP market
  if (mcpOptions.length === 0) {
    return (
      <Pressable
        onPress={() => navigation.navigate('Mcp', { screen: 'McpMarketScreen' })}
        className="bg-card flex-row items-center gap-2 rounded-xl active:opacity-80">
        <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
          {t('mcp.server.empty.add')}
        </Text>
        <ChevronRight size={16} className="text-foreground-secondary " />
      </Pressable>
    )
  }

  return (
    <SelectionDropdown items={mcpOptions} shouldDismissMenuOnSelect={false}>
      <Pressable className="bg-card flex-row items-center gap-2 rounded-xl active:opacity-80">
        {activeMcpCount > 0 ? (
          <Text className="text-foreground-secondary text-sm">{t('mcp.server.selected', { num: activeMcpCount })}</Text>
        ) : (
          <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
            {t('mcp.server.empty.label')}
          </Text>
        )}
        <ChevronsUpDown size={16} className="text-foreground-secondary " />
      </Pressable>
    </SelectionDropdown>
  )
}
