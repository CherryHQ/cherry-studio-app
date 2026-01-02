import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Switch } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import { X } from '@/componentsV2/icons'
import Row from '@/componentsV2/layout/Row'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

const SHEET_NAME = 'mcp-tool-sheet'

interface McpToolData {
  tool: { name: string; description: string }
  isEnabled: boolean
  onToggle: () => void
}

const defaultToolData: McpToolData = {
  tool: { name: '', description: '' },
  isEnabled: true,
  onToggle: () => {}
}

// Global state
let currentToolData: McpToolData = defaultToolData
let updateToolDataCallback: ((data: McpToolData) => void) | null = null

export const presentMcpToolSheet = (
  tool: { name: string; description: string },
  isEnabled: boolean,
  onToggle: () => void
) => {
  currentToolData = { tool, isEnabled, onToggle }
  updateToolDataCallback?.(currentToolData)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissMcpToolSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const McpToolSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [isVisible, setIsVisible] = useState(false)
  const [toolData, setToolData] = useState<McpToolData>(() => currentToolData)

  useEffect(() => {
    updateToolDataCallback = setToolData
    return () => {
      updateToolDataCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissMcpToolSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleDismiss = () => {
    setIsVisible(false)
  }

  const handleToggle = () => {
    toolData.onToggle()
    setToolData(prev => ({ ...prev, isEnabled: !prev.isEnabled }))
  }

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-base font-bold">{t('common.tool')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissMcpToolSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={16} />
      </Pressable>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={['auto', 0.5]}
      cornerRadius={30}
      grabber={Platform.OS === 'ios'}
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={handleDismiss}
      onDidPresent={() => setIsVisible(true)}>
      <View style={{ paddingBottom: insets.bottom + 10 }}>
        <ScrollView className="max-h-80">
          <YStack className="gap-1 px-4 pb-4">
            {/* Row 1: Name label + Toggle */}
            <Row className="px-0">
              <Text className="text-foreground-secondary">{t('common.name')}</Text>
              <Switch isSelected={toolData.isEnabled} onSelectedChange={handleToggle} />
            </Row>

            {/* Row 2: Actual tool name */}
            <YStack className="py-2">
              <Text className="text-foreground text-base" selectable>
                {toolData.tool.name}
              </Text>
            </YStack>

            {/* Row 3: Description label */}
            <YStack className="pt-2">
              <Text className="text-foreground-secondary">{t('common.description')}</Text>
            </YStack>

            {/* Row 4: Actual description */}
            <YStack className="py-2">
              <Text className="text-foreground text-base" selectable>
                {toolData.tool.description || '-'}
              </Text>
            </YStack>
          </YStack>
        </ScrollView>
      </View>
    </TrueSheet>
  )
}

McpToolSheet.displayName = 'McpToolSheet'
