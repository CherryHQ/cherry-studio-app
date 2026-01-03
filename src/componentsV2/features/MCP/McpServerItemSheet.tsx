import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Accordion, Button, cn, Divider, Spinner, Switch } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ListSkeleton } from '@/componentsV2/base/Skeleton/ListSkeleton'
import Text from '@/componentsV2/base/Text'
import { X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useMcpTools } from '@/hooks/useMcp'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { loggerService } from '@/services/LoggerService'
import { mcpService } from '@/services/McpService'
import type { MCPServer } from '@/types/mcp'
import { isIOS, isIOS26 } from '@/utils/device'

export type McpServerItemSheetMode = 'manage' | 'preview'

const logger = loggerService.withContext('McpServerItemSheet')

const SHEET_NAME = 'mcp-server-item-sheet'

// Global state for selected MCP and update function
let currentSelectedMcp: MCPServer | null = null
let currentUpdateMcpServers: ((mcps: MCPServer[]) => Promise<void>) | null = null
let currentMode: McpServerItemSheetMode = 'manage'
let updateSelectedMcpCallback: ((mcp: MCPServer | null) => void) | null = null
let updateMcpServersCallback: ((fn: ((mcps: MCPServer[]) => Promise<void>) | null) => void) | null = null
let updateModeCallback: ((mode: McpServerItemSheetMode) => void) | null = null

interface PresentOptions {
  mode?: McpServerItemSheetMode
  updateMcpServers?: (mcps: MCPServer[]) => Promise<void>
}

export const presentMcpServerItemSheet = (mcp: MCPServer, options: PresentOptions = {}) => {
  const { mode = 'manage', updateMcpServers } = options
  currentSelectedMcp = mcp
  currentUpdateMcpServers = updateMcpServers ?? null
  currentMode = mode
  updateSelectedMcpCallback?.(mcp)
  updateMcpServersCallback?.(updateMcpServers ?? null)
  updateModeCallback?.(mode)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissMcpServerItemSheet = () => TrueSheet.dismiss(SHEET_NAME)

const McpServerItemSheet: React.FC = () => {
  const { isDark } = useTheme()
  const { t } = useTranslation()
  const { bottom } = useSafeAreaInsets()
  const toast = useToast()
  const [isVisible, setIsVisible] = useState(false)
  const [selectedMcp, setSelectedMcp] = useState<MCPServer | null>(currentSelectedMcp)
  const [updateMcpServers, setUpdateMcpServers] = useState<((mcps: MCPServer[]) => Promise<void>) | null>(
    () => currentUpdateMcpServers
  )
  const [mode, setMode] = useState<McpServerItemSheetMode>(currentMode)
  const { tools, isLoading } = useMcpTools(selectedMcp?.id || '', true)
  // Keep a local copy so switch updates reflect immediately
  const [localDisabledTools, setLocalDisabledTools] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    updateSelectedMcpCallback = setSelectedMcp
    updateMcpServersCallback = fn => setUpdateMcpServers(() => fn)
    updateModeCallback = setMode
    return () => {
      updateSelectedMcpCallback = null
      updateMcpServersCallback = null
      updateModeCallback = null
    }
  }, [])

  useEffect(() => {
    if (!selectedMcp) return
    // sync local disabled tools with current selected MCP
    setLocalDisabledTools(selectedMcp.disabledTools ?? [])
  }, [selectedMcp])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissMcpServerItemSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const updateToolSwitch = async (toolName: string) => {
    try {
      if (!selectedMcp || !updateMcpServers) return

      let nextDisabledTools: string[]
      const currentlyDisabled = localDisabledTools.includes(toolName)
      const nextSelected = !currentlyDisabled
      if (nextSelected) {
        nextDisabledTools = Array.from(new Set([...localDisabledTools, toolName]))
      } else {
        nextDisabledTools = localDisabledTools.filter(tool => tool !== toolName)
      }

      setLocalDisabledTools(nextDisabledTools)

      const updatedMcpServer: MCPServer = {
        ...selectedMcp,
        disabledTools: nextDisabledTools
      }

      await updateMcpServers([updatedMcpServer])
    } catch (error) {
      logger.error('Failed to update disabled tools', error as Error)
    }
  }

  const handleAddMcp = async () => {
    if (!selectedMcp || isAdding) return
    try {
      setIsAdding(true)
      await mcpService.createMcpServer({
        ...selectedMcp,
        isActive: true
      })
      toast.show(t('mcp.market.add.success', { mcp_name: selectedMcp.name }))
      dismissMcpServerItemSheet()
    } catch (error) {
      logger.error('Failed to add MCP server', error as Error)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.7]}
      cornerRadius={30}
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}>
      {!selectedMcp ? null : (
        <YStack className={cn('gap-4', isIOS ? 'h-[65vh]' : 'h-full')}>
          {/* Header */}
          <YStack className="relative gap-4 px-4 pb-4">
            <XStack className="w-full items-center justify-center pt-5">
              <Text className="text-2xl">{selectedMcp.name}</Text>
            </XStack>
            <Pressable
              style={({ pressed }) => ({
                position: 'absolute',
                top: 16,
                right: 16,
                padding: 4,
                backgroundColor: isDark ? '#333333' : '#dddddd',
                borderRadius: 16,
                opacity: pressed ? 0.7 : 1
              })}
              onPress={dismissMcpServerItemSheet}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X className="h-4 w-4" />
            </Pressable>
            <XStack className="w-full items-center justify-center px-4">
              <Text className="text-foreground-secondary text-center text-base">{selectedMcp.description}</Text>
            </XStack>
            <Divider />
          </YStack>

          {/* Scrollable Content */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
            <YStack className="gap-4 pb-4">
              {/* Tools */}
              {isLoading ? (
                <YStack className="gap-1">
                  <Text className="text-foreground text-lg font-bold leading-5">{t('common.tool')}</Text>
                  <ListSkeleton variant="mcp" count={3} />
                </YStack>
              ) : tools.length > 0 ? (
                <YStack className="gap-1">
                  <Text className="text-foreground text-lg font-bold leading-5">{t('common.tool')}</Text>
                  <Accordion
                    defaultValue={tools.map(tool => tool.id)}
                    selectionMode="multiple"
                    variant="surface"
                    className="rounded-2xl">
                    {tools.map((tool, index) => (
                      <Accordion.Item key={index} value={tool.id}>
                        <Accordion.Trigger>
                          <View>
                            <Text>{tool.name}</Text>
                          </View>
                          <Accordion.Indicator />
                        </Accordion.Trigger>
                        <Accordion.Content>
                          <YStack>
                            <XStack className="items-start justify-between">
                              <XStack className={mode === 'manage' ? 'flex-1 gap-3' : 'gap-3'}>
                                <Text>{t('common.description')}</Text>
                                <Text
                                  className={mode === 'manage' ? 'w-[80%]' : 'flex-1'}
                                  ellipsizeMode="tail"
                                  numberOfLines={3}>
                                  {tool.description}
                                </Text>
                              </XStack>
                              {mode === 'manage' && (
                                <Switch
                                  isSelected={!localDisabledTools.includes(tool.name)}
                                  onSelectedChange={() => updateToolSwitch(tool.name)}
                                />
                              )}
                            </XStack>
                          </YStack>
                        </Accordion.Content>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </YStack>
              ) : null}
            </YStack>
          </ScrollView>

          {/* Footer */}
          {mode === 'preview' && (
            <XStack className="shrink-0 items-center justify-center gap-4 px-6" style={{ paddingBottom: bottom }}>
              <Button
                pressableFeedbackVariant="ripple"
                className=" primary-container flex-1 rounded-[30px] border px-5 py-2.5"
                onPress={handleAddMcp}
                isDisabled={isAdding}>
                {isAdding ? (
                  <Spinner size="sm" />
                ) : (
                  <Button.Label>
                    <Text className="primary-text text-[17px] font-bold">{t('button.add')}</Text>
                  </Button.Label>
                )}
              </Button>
            </XStack>
          )}
        </YStack>
      )}
    </TrueSheet>
  )
}

McpServerItemSheet.displayName = 'McpServerItemSheet'

export default McpServerItemSheet
