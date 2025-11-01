import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Accordion, Divider, Switch, useTheme } from 'heroui-native'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, TouchableOpacity, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useMcpTools } from '@/hooks/useMcp'
import type { MCPServer } from '@/types/mcp'

interface McpServerItemSheetProps {
  selectedMcp: MCPServer | null
  updateMcpServers: (mcps: MCPServer[]) => Promise<void>
}

const McpServerItemSheet = forwardRef<BottomSheetModal, McpServerItemSheetProps>(
  ({ selectedMcp, updateMcpServers }, ref) => {
    const { isDark } = useTheme()
    const { t } = useTranslation()
    const [isVisible, setIsVisible] = useState(false)
    const { tools } = useMcpTools(selectedMcp?.id || '')
    // Keep a local copy so switch updates reflect immediately
    const [localDisabledTools, setLocalDisabledTools] = useState<string[]>([])

    useEffect(() => {
      if (!selectedMcp) return
      // sync local disabled tools with current selected MCP
      setLocalDisabledTools(selectedMcp.disabledTools ?? [])
    }, [selectedMcp])

    useEffect(() => {
      if (!isVisible) return

      const backAction = () => {
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        return true
      }

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
      return () => backHandler.remove()
    }, [ref, isVisible])

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    )

    const updateToolSwitch = async (toolName: string) => {
      try {
        if (!selectedMcp) return

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
        console.error(error)
      }
    }

    return (
      <BottomSheetModal
        snapPoints={['70%']}
        enableDynamicSizing={false}
        ref={ref}
        backgroundStyle={{
          borderRadius: 30,
          backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
        }}
        handleComponent={() => null}
        backdropComponent={renderBackdrop}
        onDismiss={() => setIsVisible(false)}
        onChange={index => setIsVisible(index >= 0)}>
        {!selectedMcp ? null : (
          <YStack className="relative flex-1 gap-10">
            <XStack className="top-5 w-full items-center justify-center">
              <Text className="text-2xl">{selectedMcp.name}</Text>
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
              onPress={() => (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X className="h-4 w-4" />
            </TouchableOpacity>

            <XStack className="w-full items-center justify-center">
              <Text className="text-lg">{selectedMcp.description}</Text>
            </XStack>

            <Divider className="top-[-10px]" />

            <BottomSheetScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
              <YStack className="gap-4">
                {/* Description */}
                {selectedMcp.description && (
                  <YStack className="gap-1">
                    <Text className="text-lg font-bold leading-5 text-text-primary dark:text-text-primary-dark">
                      {t('common.description')}
                    </Text>
                    <Text className="leading-5 text-text-secondary dark:text-text-secondary-dark">
                      {selectedMcp.description}
                    </Text>
                  </YStack>
                )}
                {/* Tools */}
                {tools.length > 0 && (
                  <YStack className="gap-1">
                    <Text className="text-lg font-bold leading-5 text-text-primary dark:text-text-primary-dark">
                      {t('common.tool')}
                    </Text>
                    <Accordion
                      defaultValue={tools.map(tool => tool.id)}
                      selectionMode="multiple"
                      variant="border"
                      className="rounded-lg">
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
                                  color="success"
                                  isSelected={localDisabledTools.includes(tool.name) ? false : true}
                                  onSelectedChange={() => updateToolSwitch(tool.name)}>
                                  <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
                                </Switch>
                              </XStack>
                            </YStack>
                          </Accordion.Content>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  </YStack>
                )}
              </YStack>
            </BottomSheetScrollView>
          </YStack>
        )}
      </BottomSheetModal>
    )
  }
)

McpServerItemSheet.displayName = 'McpServerItemSheet'

export default McpServerItemSheet
