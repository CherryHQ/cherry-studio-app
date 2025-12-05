import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Accordion, Divider, Switch } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, ScrollView, TouchableOpacity, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useMcpTools } from '@/hooks/useMcp'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import type { MCPServer } from '@/types/mcp'

const logger = loggerService.withContext('McpServerItemSheet')

const SHEET_NAME = 'mcp-server-item-sheet'

// Global state for selected MCP and update function
let currentSelectedMcp: MCPServer | null = null
let currentUpdateMcpServers: ((mcps: MCPServer[]) => Promise<void>) | null = null
let updateSelectedMcpCallback: ((mcp: MCPServer | null) => void) | null = null
let updateMcpServersCallback: ((fn: (mcps: MCPServer[]) => Promise<void>) => void) | null = null

export const presentMcpServerItemSheet = (mcp: MCPServer, updateMcpServers: (mcps: MCPServer[]) => Promise<void>) => {
  currentSelectedMcp = mcp
  currentUpdateMcpServers = updateMcpServers
  updateSelectedMcpCallback?.(mcp)
  updateMcpServersCallback?.(updateMcpServers)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissMcpServerItemSheet = () => TrueSheet.dismiss(SHEET_NAME)

const McpServerItemSheet: React.FC = () => {
  const { isDark } = useTheme()
  const { t } = useTranslation()
  const [isVisible, setIsVisible] = useState(false)
  const [selectedMcp, setSelectedMcp] = useState<MCPServer | null>(currentSelectedMcp)
  const [updateMcpServers, setUpdateMcpServers] = useState<((mcps: MCPServer[]) => Promise<void>) | null>(
    () => currentUpdateMcpServers
  )
  const { tools } = useMcpTools(selectedMcp?.id || '')
  // Keep a local copy so switch updates reflect immediately
  const [localDisabledTools, setLocalDisabledTools] = useState<string[]>([])

  useEffect(() => {
    updateSelectedMcpCallback = setSelectedMcp
    updateMcpServersCallback = fn => setUpdateMcpServers(() => fn)
    return () => {
      updateSelectedMcpCallback = null
      updateMcpServersCallback = null
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

  const header = (
    <YStack className="relative gap-4 pb-4">
      <XStack className="w-full items-center justify-center pt-5">
        <Text className="text-2xl">{selectedMcp?.name}</Text>
      </XStack>
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16
        }}
        onPress={dismissMcpServerItemSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X className="h-4 w-4" />
      </TouchableOpacity>
      <XStack className="w-full items-center justify-center">
        <Text className="text-lg">{selectedMcp?.description}</Text>
      </XStack>
      <Divider />
    </YStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.7]}
      cornerRadius={30}
      dismissible
      dimmed
      scrollable
      header={header}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}>
      {!selectedMcp ? null : (
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
          <YStack className="gap-4 pb-10">
            {/* Description */}
            {selectedMcp.description && (
              <YStack className="gap-1">
                <Text className="text-foreground text-lg font-bold leading-5">{t('common.description')}</Text>
                <Text className="text-foreground-secondary leading-5">{selectedMcp.description}</Text>
              </YStack>
            )}
            {/* Tools */}
            {tools.length > 0 && (
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
                          <XStack className="items-center justify-between">
                            <XStack className="flex-1 gap-3">
                              <Text>{t('common.description')}</Text>
                              <Text className="w-[80%]" ellipsizeMode="tail">
                                {tool.description}
                              </Text>
                            </XStack>

                            <Switch
                              isSelected={localDisabledTools.includes(tool.name) ? false : true}
                              onSelectedChange={() => updateToolSwitch(tool.name)}></Switch>
                          </XStack>
                        </YStack>
                      </Accordion.Content>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </YStack>
            )}
          </YStack>
        </ScrollView>
      )}
    </TrueSheet>
  )
}

McpServerItemSheet.displayName = 'McpServerItemSheet'

export default McpServerItemSheet
