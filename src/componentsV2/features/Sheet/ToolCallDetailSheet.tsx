import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Spinner } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import { CircleCheck, X, XCircle } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import type { MCPToolResponseStatus } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'
import { isIOS26 } from '@/utils/device'
import { truncateFormattedJson } from '@/utils/json'

const SHEET_NAME = 'tool-call-detail-sheet'

interface ToolCallDetailData {
  tool: MCPTool
  arguments: Record<string, unknown> | undefined
  status: MCPToolResponseStatus
  response?: any
}

const defaultData: ToolCallDetailData = {
  tool: {
    id: '',
    serverId: '',
    serverName: '',
    name: '',
    description: '',
    inputSchema: { type: 'object', title: '', properties: {} },
    type: 'mcp'
  },
  arguments: undefined,
  status: 'pending',
  response: undefined
}

// Global state
let currentData: ToolCallDetailData = defaultData
let updateDataCallback: ((data: ToolCallDetailData) => void) | null = null

export const presentToolCallDetailSheet = (data: ToolCallDetailData) => {
  currentData = data
  updateDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissToolCallDetailSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const ToolCallDetailSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [isVisible, setIsVisible] = useState(false)
  const [data, setData] = useState<ToolCallDetailData>(() => currentData)

  useEffect(() => {
    updateDataCallback = setData
    return () => {
      updateDataCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissToolCallDetailSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleDismiss = () => {
    setIsVisible(false)
  }

  const isPending = data.status === 'pending' || data.status === 'invoking'
  const isDone = data.status === 'done'
  const isError = data.status === 'error'

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
        onPress={dismissToolCallDetailSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={16} />
      </Pressable>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={['auto', 0.5, 0.9]}
      cornerRadius={30}
      grabber={Platform.OS === 'ios'}
      dismissible
      dimmed
      scrollable
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={handleDismiss}
      onDidPresent={() => setIsVisible(true)}>
      <View style={{ paddingBottom: insets.bottom + 10 }}>
        <ScrollView
          className="max-h-[500px]"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
          nestedScrollEnabled={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}>
          <YStack className="gap-4">
            {/* Tool Name with Status */}
            <YStack className="gap-1">
              <Text className="text-foreground-secondary text-xs">{t('common.name')}</Text>
              <XStack className="items-center gap-2">
                <Text className="text-foreground text-base" selectable>
                  {data.tool.name}
                </Text>
                {isPending && <Spinner size="sm" />}
                {isDone && <CircleCheck size={16} className="text-green-600" />}
                {isError && <XCircle size={16} className="text-red-600" />}
              </XStack>
            </YStack>

            {/* Parameters */}
            <YStack className="gap-1">
              <Text className="text-foreground-secondary text-xs">{t('common.parameters')}</Text>
              <View className="bg-background rounded-md p-3">
                <Text className="text-foreground font-mono text-sm" selectable>
                  {(() => {
                    const result = truncateFormattedJson(data.arguments)
                    return result.isTruncated ? `${result.text}\n...${t('common.content_too_long')}` : result.text
                  })()}
                </Text>
              </View>
            </YStack>

            {/* Results */}
            {(isDone || isError) && data.response && (
              <YStack className="gap-1">
                <Text className="text-foreground-secondary text-xs">{t('common.result')}</Text>
                <View className="bg-background rounded-md p-3">
                  <Text className="text-foreground font-mono text-sm" selectable>
                    {(() => {
                      const result = truncateFormattedJson(data.response)
                      return result.isTruncated ? `${result.text}\n...${t('common.content_too_long')}` : result.text
                    })()}
                  </Text>
                </View>
              </YStack>
            )}
          </YStack>
        </ScrollView>
      </View>
    </TrueSheet>
  )
}

ToolCallDetailSheet.displayName = 'ToolCallDetailSheet'
