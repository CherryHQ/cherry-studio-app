import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import { useTheme } from '@/hooks/useTheme'
import type { ThinkingMessageBlock } from '@/types/message'
import { MessageBlockStatus, MessageBlockType } from '@/types/message'
import { isIOS26 } from '@/utils/device'
import { escapeBrackets, removeSvgEmptyLines } from '@/utils/formats'

import { MarkdownRenderer } from '../../../screens/home/markdown/MarkdownRenderer'

const SHEET_NAME = 'thinking-detail-sheet'

interface ThinkingDetailData {
  block: ThinkingMessageBlock
}

const defaultData: ThinkingDetailData = {
  block: {
    id: '',
    messageId: '',
    type: MessageBlockType.THINKING,
    content: '',
    status: MessageBlockStatus.SUCCESS,
    createdAt: 0,
    thinking_millsec: 0
  }
}

// Global state
let currentData: ThinkingDetailData = defaultData
let updateDataCallback: ((data: ThinkingDetailData) => void) | null = null

export const presentThinkingDetailSheet = (data: ThinkingDetailData) => {
  currentData = data
  updateDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissThinkingDetailSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const ThinkingDetailSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [isVisible, setIsVisible] = useState(false)
  const [data, setData] = useState<ThinkingDetailData>(() => currentData)

  useEffect(() => {
    updateDataCallback = setData
    return () => {
      updateDataCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissThinkingDetailSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleDismiss = () => {
    setIsVisible(false)
  }

  const getContent = () => {
    return removeSvgEmptyLines(escapeBrackets(data.block.content))
  }

  const displaySeconds = ((data.block.thinking_millsec || 0) / 1000).toFixed(1)

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-base font-bold">{t('chat.think_done', { seconds: displaySeconds })}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissThinkingDetailSheet}
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
          <MarkdownRenderer content={getContent()} />
        </ScrollView>
      </View>
    </TrueSheet>
  )
}

ThinkingDetailSheet.displayName = 'ThinkingDetailSheet'
