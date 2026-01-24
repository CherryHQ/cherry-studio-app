import { DrawerActions, useNavigation } from '@react-navigation/native'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  Container,
  DrawerGestureWrapper,
  HeaderBar,
  ListSkeleton,
  presentDialog,
  SafeAreaContainer,
  SearchInput
} from '@/componentsV2'
import { McpMarketContent } from '@/componentsV2/features/MCP/McpMarketContent'
import { Menu, Plus, Store } from '@/componentsV2/icons/LucideIcon'
import { useMcpServers } from '@/hooks/useMcp'
import { useSearch } from '@/hooks/useSearch'
import { useSkeletonLoading } from '@/hooks/useSkeletonLoading'
import { useToast } from '@/hooks/useToast'
import { loggerService } from '@/services/LoggerService'
import { mcpClientService } from '@/services/mcp/McpClientService'
import { mcpService } from '@/services/McpService'
import type { MCPServer } from '@/types/mcp'
import type { DrawerNavigationProps, McpNavigationProps } from '@/types/naviagate'
import { uuid } from '@/utils'

const logger = loggerService.withContext('McpScreen')

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

  // Track which MCP server is being validated
  const [validatingServerId, setValidatingServerId] = useState<string | null>(null)

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
    // If disabling, directly update
    if (!isActive) {
      const result = await updateMcpServers([{ ...mcp, isActive: false }])
      if (result.totalFailed > 0) {
        const failedServer = result.failed[0]
        toast.show(t('mcp.server.update_failed', { name: failedServer.item.name }), { color: 'red', duration: 3000 })
      }
      return
    }

    // If enabling, perform validation first
    setValidatingServerId(mcp.id)
    try {
      // Check 1: URL should not be empty for HTTP type servers
      if (mcp.type === 'streamableHttp' || mcp.type === 'sse') {
        if (!mcp.baseUrl || mcp.baseUrl.trim() === '') {
          presentDialog('error', {
            title: t('mcp.errors.enable_failed'),
            content: t('mcp.errors.url_empty'),
            confirmText: t('common.ok')
          })
          setValidatingServerId(null)
          return
        }

        // Check 2: Test if tools can be fetched
        try {
          const tools = await mcpClientService.listTools(mcp)
          // Empty tools is acceptable - no need to handle
          logger.info(`MCP server ${mcp.name} validation passed, fetched ${tools.length} tools`)
        } catch (error) {
          // Check 3: Handle other unknown errors
          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.error(`Failed to validate MCP server ${mcp.name}:`, error as Error)

          presentDialog('error', {
            title: t('mcp.errors.enable_failed'),
            content: errorMessage || t('mcp.errors.validation_failed'),
            confirmText: t('common.ok')
          })
          setValidatingServerId(null)
          return
        }
      }

      // All checks passed, enable the server
      const result = await updateMcpServers([{ ...mcp, isActive: true }])
      if (result.totalFailed > 0) {
        const failedServer = result.failed[0]
        toast.show(t('mcp.server.update_failed', { name: failedServer.item.name }), { color: 'red', duration: 3000 })
      }
    } catch (error) {
      const failedServerName = mcp.name
      toast.show(t('mcp.server.update_failed', { name: failedServerName }), { color: 'red', duration: 3000 })
    } finally {
      setValidatingServerId(null)
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
                validatingServerId={validatingServerId}
              />
            )}
          </Container>
        </View>
      </DrawerGestureWrapper>
    </SafeAreaContainer>
  )
}
