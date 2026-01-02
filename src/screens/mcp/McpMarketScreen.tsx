import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InteractionManager } from 'react-native'

import { Container, HeaderBar, ListSkeleton, SafeAreaContainer, SearchInput } from '@/componentsV2'
import { McpMarketContent } from '@/componentsV2/features/MCP/McpMarketContent'
import { presentMcpServerItemSheet } from '@/componentsV2/features/MCP/McpServerItemSheet'
import { initBuiltinMcp } from '@/config/mcp'
import { useSearch } from '@/hooks/useSearch'
import type { MCPServer } from '@/types/mcp'

export function McpMarketScreen() {
  const { t } = useTranslation()
  const [isReady, setIsReady] = useState(false)
  const mcpServers = initBuiltinMcp()
  const {
    searchText,
    setSearchText,
    filteredItems: filteredMcps
  } = useSearch(
    mcpServers,
    useCallback((mcp: MCPServer) => [mcp.name || '', mcp.id || ''], [])
  )

  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      setIsReady(true)
    })
    return () => interaction.cancel()
  }, [])

  const handleMcpServerItemPress = (mcp: MCPServer) => {
    presentMcpServerItemSheet(mcp, { mode: 'preview' })
  }

  return (
    <SafeAreaContainer className="pb-0">
      <HeaderBar title={t('mcp.market.title')} />
      <Container className="gap-2.5 py-0">
        <SearchInput placeholder={t('common.search_placeholder')} value={searchText} onChangeText={setSearchText} />
        {isReady ? (
          <McpMarketContent mcps={filteredMcps} handleMcpServerItemPress={handleMcpServerItemPress} mode="add" />
        ) : (
          <ListSkeleton variant="mcp" />
        )}
      </Container>
    </SafeAreaContainer>
  )
}
