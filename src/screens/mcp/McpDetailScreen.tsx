import type { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Button, Spinner, Switch } from 'heroui-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, ScrollView } from 'react-native'

import {
  Group,
  GroupTitle,
  HeaderBar,
  presentDialog,
  Row,
  SafeAreaContainer,
  SearchInput,
  TextField
} from '@/componentsV2'
import { ListSkeleton } from '@/componentsV2/base/Skeleton/ListSkeleton'
import Text from '@/componentsV2/base/Text'
import { presentHeadersEditSheet } from '@/componentsV2/features/Sheet/HeadersEditSheet'
import { presentMcpDescriptionSheet } from '@/componentsV2/features/Sheet/McpDescriptionSheet'
import { presentMcpToolSheet } from '@/componentsV2/features/Sheet/McpToolSheet'
import { RefreshCw, Trash2 } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useMcpOAuth, useMcpServer, useMcpTools } from '@/hooks/useMcp'
import { useSearch } from '@/hooks/useSearch'
import { useToast } from '@/hooks/useToast'
import type { McpStackParamList } from '@/navigators/McpStackNavigator'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('McpDetailScreen')

type McpDetailRouteProp = RouteProp<McpStackParamList, 'McpDetailScreen'>

export default function McpDetailScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation()
  const route = useRoute<McpDetailRouteProp>()
  const toast = useToast()
  const { mcpId } = route.params ?? {}

  const { mcpServer, isLoading, updateMcpServer, deleteMcpServer } = useMcpServer(mcpId ?? '')
  const { tools, isLoading: isToolsLoading, refetch: refetchTools } = useMcpTools(mcpId ?? '', true)

  // Search functionality for tools
  const {
    searchText,
    setSearchText,
    filteredItems: filteredTools
  } = useSearch(
    tools,
    useCallback((tool: (typeof tools)[0]) => [tool.name || '', tool.description || ''], [])
  )

  const isBuiltIn = mcpServer?.type === 'inMemory'
  const isHttpType = mcpServer?.type === 'streamableHttp' || mcpServer?.type === 'sse'

  // Local state for immediate UI updates
  const [localDisabledTools, setLocalDisabledTools] = useState<string[]>([])
  const [localName, setLocalName] = useState<string>('')
  const [localDescription, setLocalDescription] = useState<string>('')
  const [localUrl, setLocalUrl] = useState<string>('')
  const [localHeaders, setLocalHeaders] = useState<Record<string, string>>({})

  // OAuth hook for HTTP type servers
  // Use localUrl since it's always current (synced with mcpServer.baseUrl and updated by user edits)
  const { isAuthenticated, isAuthenticating, triggerOAuth, clearAuth } = useMcpOAuth(isHttpType ? localUrl : undefined)

  // Sync local state with mcpServer
  useEffect(() => {
    if (mcpServer) {
      setLocalDisabledTools(mcpServer.disabledTools || [])
      setLocalName(mcpServer.name || '')
      setLocalDescription(mcpServer.description || '')
      setLocalUrl(mcpServer.baseUrl || '')
      setLocalHeaders(mcpServer.headers || {})
    }
  }, [mcpServer])

  const handleActiveChange = async (checked: boolean) => {
    if (!mcpServer) return

    try {
      await updateMcpServer({ isActive: checked })
    } catch (error) {
      logger.error('Failed to update MCP server active state', error as Error)
    }
  }

  const handleDeleteMcp = () => {
    presentDialog('error', {
      title: t('mcp.server.delete.title'),
      content: t('mcp.server.delete.content'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: async () => {
        await deleteMcpServer()
        navigation.goBack()
      }
    })
  }

  // Ref to store temp value during dialog editing
  const tempValueRef = useRef<string>('')

  const handleEditField = (field: 'name' | 'url') => {
    const currentValue = field === 'name' ? localName : localUrl
    tempValueRef.current = currentValue

    presentDialog('info', {
      title: t(`common.${field}`),
      content: (
        <TextField>
          <TextField.Input
            className="rounded-xl"
            defaultValue={currentValue}
            onChangeText={text => {
              tempValueRef.current = text
            }}
            autoFocus
            autoCapitalize={field === 'url' ? 'none' : 'sentences'}
            autoCorrect={field !== 'url'}
            keyboardType={field === 'url' ? 'url' : 'default'}
          />
        </TextField>
      ),
      onConfirm: async () => {
        const newValue = tempValueRef.current
        if (field === 'name') {
          setLocalName(newValue)
          if (newValue !== mcpServer?.name) {
            await updateMcpServer({ name: newValue })
          }
        } else if (field === 'url') {
          setLocalUrl(newValue)
          if (newValue !== mcpServer?.baseUrl) {
            await updateMcpServer({ baseUrl: newValue })
          }
        }
      }
    })
  }

  const handleEditDescription = () => {
    presentMcpDescriptionSheet(localDescription, async newDescription => {
      setLocalDescription(newDescription)
      if (newDescription !== mcpServer?.description) {
        await updateMcpServer({ description: newDescription })
      }
    })
  }

  const handleToolToggle = async (toolName: string) => {
    if (!mcpServer) return

    try {
      const currentlyDisabled = localDisabledTools.includes(toolName)
      let nextDisabledTools: string[]

      if (currentlyDisabled) {
        // Enable the tool (remove from disabled list)
        nextDisabledTools = localDisabledTools.filter(t => t !== toolName)
      } else {
        // Disable the tool (add to disabled list)
        nextDisabledTools = [...localDisabledTools, toolName]
      }

      // Update local state immediately
      setLocalDisabledTools(nextDisabledTools)

      // Persist to server
      await updateMcpServer({ disabledTools: nextDisabledTools })
    } catch (error) {
      logger.error('Failed to toggle tool', error as Error)
      // Revert on error
      setLocalDisabledTools(mcpServer.disabledTools || [])
    }
  }

  const handleEditHeaders = () => {
    presentHeadersEditSheet(localHeaders, async newHeaders => {
      setLocalHeaders(newHeaders)
      await updateMcpServer({ headers: newHeaders })
    })
  }

  const handleOAuthConnect = async () => {
    if (isAuthenticated) {
      clearAuth()
    } else {
      const result = await triggerOAuth()
      if (!result.success) {
        // Show error to user
        const errorMessage = result.error || t('mcp.auth.oauth_failed')
        toast.show(errorMessage, { color: 'red', duration: 3000 })
        logger.warn(`OAuth failed:`, { errorCode: result.errorCode, error: result.error })
      }
    }
  }

  const hasHeaders = Object.keys(localHeaders).length > 0

  if (isLoading || !mcpServer) {
    return (
      <SafeAreaContainer>
        <HeaderBar title={t('mcp.server.title')} />
        <YStack className="flex-1 items-center justify-center">
          <ListSkeleton variant="mcp" count={3} />
        </YStack>
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer className="pb-0">
      <HeaderBar
        title={localName || mcpServer?.name}
        rightButton={{
          icon: <Trash2 size={20} />,
          onPress: handleDeleteMcp
        }}
      />
      <YStack className="flex-1 bg-transparent px-4">
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={Platform.OS === 'android'}>
          <YStack className="gap-6 pb-10">
            {/* Group 1: Management */}
            <YStack className="gap-2">
              <GroupTitle>{t('common.manage')}</GroupTitle>
              <Group>
                <Row>
                  <Text>{t('common.enabled')}</Text>
                  <Switch isSelected={mcpServer?.isActive ?? false} onSelectedChange={handleActiveChange} />
                </Row>
                <Row>
                  <Text>{t('common.name')}</Text>
                  <Pressable onPress={() => handleEditField('name')} className="active:opacity-80">
                    <Text className="primary-text primary-border border-b">{localName || t('common.name')}</Text>
                  </Pressable>
                </Row>
                <Row>
                  <Text>{t('common.description')}</Text>
                  <Pressable onPress={handleEditDescription} className="max-w-1/2 w-auto active:opacity-80">
                    <Text
                      className="primary-text primary-border border-b text-right"
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {localDescription || t('common.add')}
                    </Text>
                  </Pressable>
                </Row>
                <Row>
                  <Text>{t('common.type')}</Text>
                  <Text className="primary-badge rounded-lg border-[0.5px] px-2 py-0.5 text-sm">
                    {t(`mcp.type.${mcpServer?.type}`)}
                  </Text>
                </Row>
                {!isBuiltIn && (
                  <Row>
                    <Text>{t('common.url')}</Text>
                    <Pressable onPress={() => handleEditField('url')} className="active:opacity-80">
                      <Text className="primary-text primary-border border-b">
                        {localUrl || 'https://example.com/mcp'}
                      </Text>
                    </Pressable>
                  </Row>
                )}
              </Group>
            </YStack>

            {/* Group 2: Authentication - Only for HTTP type servers */}
            {isHttpType && (
              <YStack className="gap-2">
                <GroupTitle>{t('mcp.auth.title')}</GroupTitle>
                <Group>
                  {/* Custom Headers */}
                  <Row>
                    <Text>{t('mcp.auth.headers')}</Text>
                    <Pressable onPress={handleEditHeaders} className="active:opacity-80">
                      <Text className="primary-text primary-border border-b">
                        {hasHeaders ? t('common.edit') : t('common.add')}
                      </Text>
                    </Pressable>
                  </Row>

                  {/* OAuth */}
                  <Row>
                    <XStack className="items-center gap-2">
                      <Text>{t('mcp.auth.oauth')}</Text>
                      {isAuthenticated && (
                        <Text className="primary-badge rounded-md border-[0.5px] px-2 py-0.5 text-xs">
                          {t('mcp.auth.connected')}
                        </Text>
                      )}
                    </XStack>
                    <Button
                      size="sm"
                      className="primary-container rounded-xl border"
                      variant={isAuthenticated ? 'ghost' : undefined}
                      onPress={handleOAuthConnect}
                      isDisabled={isAuthenticating}>
                      {isAuthenticating ? (
                        <Spinner size="sm" />
                      ) : (
                        <Button.Label className="primary-text">
                          {isAuthenticated ? t('mcp.auth.disconnect') : t('mcp.auth.connect')}
                        </Button.Label>
                      )}
                    </Button>
                  </Row>
                </Group>
              </YStack>
            )}

            {/* Group 3: Tools */}
            <YStack className="gap-2">
              <XStack className="items-center gap-2">
                <GroupTitle>{t('common.tool')}</GroupTitle>
                <Pressable onPress={refetchTools} disabled={isToolsLoading} className="p-1 active:opacity-60">
                  <RefreshCw
                    size={14}
                    className={`text-foreground-secondary ${isToolsLoading ? 'animate-spin' : ''}`}
                  />
                </Pressable>
              </XStack>
              {tools.length > 0 && (
                <SearchInput
                  placeholder={t('common.search_placeholder')}
                  value={searchText}
                  onChangeText={setSearchText}
                />
              )}
              <Group>
                {isToolsLoading ? (
                  <ListSkeleton variant="mcp" count={3} />
                ) : filteredTools.length > 0 ? (
                  filteredTools.map(tool => {
                    const isEnabled = !localDisabledTools.includes(tool.name)
                    return (
                      <Pressable
                        key={tool.id}
                        onPress={() =>
                          presentMcpToolSheet({ name: tool.name, description: tool.description || '' }, isEnabled, () =>
                            handleToolToggle(tool.name)
                          )
                        }
                        className="active:opacity-80">
                        <Row>
                          <Text numberOfLines={1} className="mr-3 flex-1">
                            {tool.name}
                          </Text>
                          <Switch isSelected={isEnabled} onSelectedChange={() => handleToolToggle(tool.name)} />
                        </Row>
                      </Pressable>
                    )
                  })
                ) : tools.length === 0 ? (
                  <Row>
                    <Text className="text-foreground-secondary">{t('mcp.server.empty.label')}</Text>
                  </Row>
                ) : null}
              </Group>
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaContainer>
  )
}
