import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  Container,
  DrawerGestureWrapper,
  HeaderBar,
  ListSkeleton,
  SafeAreaContainer,
  SearchInput
} from '@/componentsV2'
import { McpMarketContent } from '@/componentsV2/features/MCP/McpMarketContent'
import McpServerItemSheet, { presentMcpServerItemSheet } from '@/componentsV2/features/MCP/McpServerItemSheet'
import { Menu } from '@/componentsV2/icons'
import { useMcpServers } from '@/hooks/useMcp'
import { useSearch } from '@/hooks/useSearch'
import type { MCPServer } from '@/types/mcp'
import type { DrawerNavigationProps } from '@/types/naviagate'

export function McpMarketScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const { mcpServers, isLoading, updateMcpServers } = useMcpServers()
  const {
    searchText,
    setSearchText,
    filteredItems: filteredMcps
  } = useSearch(
    mcpServers,
    useCallback((mcp: MCPServer) => [mcp.name || '', mcp.id || ''], [])
  )

  const [showSkeleton, setShowSkeleton] = useState(true)
  const loadingStartTime = useRef(Date.now())

  useEffect(() => {
    if (isLoading) {
      loadingStartTime.current = Date.now()
      setShowSkeleton(true)
      return
    }
    const elapsed = Date.now() - loadingStartTime.current
    const minDuration = 300
    const remaining = minDuration - elapsed
    if (remaining <= 0) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(false), remaining)
    return () => clearTimeout(timer)
  }, [isLoading])

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const handleMcpServerItemPress = (mcp: MCPServer) => {
    presentMcpServerItemSheet(mcp, updateMcpServers)
  }

  return (
    <SafeAreaContainer className="pb-0">
      <DrawerGestureWrapper>
        <View collapsable={false} className="flex-1">
          <HeaderBar
            title={t('mcp.market.title')}
            leftButton={{
              icon: <Menu size={24} />,
              onPress: handleMenuPress
            }}
          />
          <Container className="gap-2.5 py-0">
            <SearchInput
              placeholder={t('assistants.market.search_placeholder')}
              value={searchText}
              onChangeText={setSearchText}
            />
            {showSkeleton ? (
              <ListSkeleton variant="mcp" />
            ) : (
              <McpMarketContent
                mcps={filteredMcps}
                updateMcpServers={updateMcpServers}
                handleMcpServerItemPress={handleMcpServerItemPress}
              />
            )}
          </Container>
          <McpServerItemSheet />
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
