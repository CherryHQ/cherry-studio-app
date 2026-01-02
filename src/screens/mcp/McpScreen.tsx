import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback } from 'react'
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
import { Menu, Plus, Store } from '@/componentsV2/icons/LucideIcon'
import { useMcpServers } from '@/hooks/useMcp'
import { useSearch } from '@/hooks/useSearch'
import { useSkeletonLoading } from '@/hooks/useSkeletonLoading'
import { useToast } from '@/hooks/useToast'
import { mcpService } from '@/services/McpService'
import type { MCPServer } from '@/types/mcp'
import type { DrawerNavigationProps, McpNavigationProps } from '@/types/naviagate'
import { uuid } from '@/utils'

export default function McpScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps & McpNavigationProps>()
  const toast = useToast()
  const { mcpServers, isLoading, updateMcpServers } = useMcpServers()
  const {
    searchText,
    setSearchText,
    filteredItems: filteredMcps
  } = useSearch(
    mcpServers,
    useCallback((mcp: MCPServer) => [mcp.name || '', mcp.id || ''], [])
  )

  const showSkeleton = useSkeletonLoading(isLoading)

  const handleMenuPress = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const handleNavigateToMarket = () => {
    navigation.navigate('McpMarketScreen')
  }

  const handleMcpServerItemPress = (mcp: MCPServer) => {
    navigation.navigate('McpDetailScreen', { mcpId: mcp.id })
  }

  const handleToggle = async (mcp: MCPServer, isActive: boolean) => {
    const result = await updateMcpServers([{ ...mcp, isActive }])
    if (result.totalFailed > 0) {
      const failedServer = result.failed[0]
      toast.show(t('mcp.server.update_failed', { name: failedServer.item.name }), { color: 'red', duration: 3000 })
    }
  }

  const handleAddMcp = async () => {
    const newMcp = {
      id: uuid(),
      name: t('mcp.server.new'),
      type: 'streamableHttp' as const,
      baseUrl: '',
      headers: {},
      isActive: false,
      installedAt: Date.now()
    }
    await mcpService.createMcpServer(newMcp)
    navigation.navigate('McpDetailScreen', { mcpId: newMcp.id })
  }

  return (
    <SafeAreaContainer className="pb-0">
      <DrawerGestureWrapper>
        <View collapsable={false} className="flex-1">
          <HeaderBar
            title={t('mcp.server.title')}
            leftButton={{
              icon: <Menu size={24} />,
              onPress: handleMenuPress
            }}
            rightButtons={[
              {
                icon: <Plus size={24} />,
                onPress: handleAddMcp
              },
              {
                icon: <Store size={24} />,
                onPress: handleNavigateToMarket
              }
            ]}
          />
          <Container className="gap-2.5 py-0">
            <SearchInput placeholder={t('common.search_placeholder')} value={searchText} onChangeText={setSearchText} />
            {showSkeleton ? (
              <ListSkeleton variant="mcp" />
            ) : (
              <McpMarketContent
                mcps={filteredMcps}
                handleMcpServerItemPress={handleMcpServerItemPress}
                onToggle={handleToggle}
              />
            )}
          </Container>
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
