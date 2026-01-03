import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

const SHEET_NAME = 'text-selection-sheet'

// Global state for content
let currentContent = ''
let updateContentCallback: ((content: string) => void) | null = null

export const presentTextSelectionSheet = (content: string) => {
  currentContent = content
  updateContentCallback?.(content)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissTextSelectionSheet = () => TrueSheet.dismiss(SHEET_NAME)

interface SelectableTextProps {
  children: string
}

function SelectableText({ children }: SelectableTextProps) {
  if (Platform.OS === 'ios') {
    return (
      <TextField className="w-full flex-1">
        <TextField.Input
          className="w-full flex-1 rounded-none border-0 px-4 py-4 text-sm leading-6"
          multiline
          editable={false}
          value={String(children)}
          animation={{
            backgroundColor: {
              value: {
                blur: 'transparent',
                focus: 'transparent',
                error: 'transparent'
              }
            }
          }}
        />
      </TextField>
    )
  } else {
    return (
      <Text className="px-4 py-4 text-sm leading-6" selectable>
        {children}
      </Text>
    )
  }
}

const TextSelectionSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const [content, setContent] = useState(currentContent)

  useEffect(() => {
    updateContentCallback = setContent
    return () => {
      updateContentCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissTextSelectionSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-base font-bold">{t('common.select_text')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissTextSelectionSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={16} />
      </Pressable>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.9]}
      cornerRadius={30}
      grabber
      dismissible
      dimmed
      scrollable
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}>
      <View className="h-[70vh] flex-1">
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 40
          }}
          nestedScrollEnabled={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}>
          <SelectableText>{content}</SelectableText>
        </ScrollView>
      </View>
    </TrueSheet>
  )
}

TextSelectionSheet.displayName = 'TextSelectionSheet'

export default TextSelectionSheet
