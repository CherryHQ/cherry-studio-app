import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { Container, DrawerGestureWrapper, HeaderBar, SafeAreaContainer, SearchInput } from '@/componentsV2'
import { McpMarketContent } from '@/componentsV2/features/MCP/McpMarketContent'
import McpServerItemSheet from '@/componentsV2/features/MCP/McpServerItemSheet'
import { Menu } from '@/componentsV2/icons'
import { useMcpServers } from '@/hooks/useMcp'
import { useSearch } from '@/hooks/useSearch'
import type { MCPServer } from '@/types/mcp'
import type { DrawerNavigationProps } from '@/types/naviagate'

export function McpMarketScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const { mcpServers, isLoading, updateMcpServers } = useMcpServers()
  const bottomSheetRef = useRef<BottomSheetModal>(null)
  const [selectedMcp, setSelectedMcp] = useState<MCPServer | null>(null)
  const {
    searchText,
    setSearchText,
    filteredItems: filteredMcps
  } = useSearch(
    mcpServers,
    useCallback((mcp: MCPServer) => [mcp.name || '', mcp.id || ''], [])
  )

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const handleMcpServerItemPress = (mcp: MCPServer) => {
    setSelectedMcp(mcp)
    bottomSheetRef.current?.present()
  }

  if (isLoading) {
    return (
      <SafeAreaContainer style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
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
            <McpMarketContent
              mcps={filteredMcps}
              updateMcpServers={updateMcpServers}
              handleMcpServerItemPress={handleMcpServerItemPress}
            />
          </Container>
          <McpServerItemSheet ref={bottomSheetRef} selectedMcp={selectedMcp} updateMcpServers={updateMcpServers} />
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
