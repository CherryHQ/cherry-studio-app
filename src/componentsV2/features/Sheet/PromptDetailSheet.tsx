import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

const SHEET_NAME = 'prompt-detail-sheet'

// Global state
let currentText = ''
let currentTitle = ''
let onTextChangeCallback: ((text: string) => void) | null = null
let onDismissCallback: ((text: string) => void) | null = null
let updateLocalTextCallback: ((text: string) => void) | null = null

export const presentPromptDetailSheet = (
  text: string,
  onChange: (text: string) => void,
  title?: string,
  onDismiss?: (text: string) => void
) => {
  currentText = text
  currentTitle = title || ''
  onTextChangeCallback = onChange
  onDismissCallback = onDismiss || null
  updateLocalTextCallback?.(text)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissPromptDetailSheet = () => TrueSheet.dismiss(SHEET_NAME)

const PromptDetailSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [isVisible, setIsVisible] = useState(false)
  const [localText, setLocalText] = useState(currentText)

  useEffect(() => {
    updateLocalTextCallback = setLocalText
    return () => {
      updateLocalTextCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissPromptDetailSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleTextChange = (text: string) => {
    setLocalText(text)
    onTextChangeCallback?.(text)
  }

  const handleDismiss = () => {
    setIsVisible(false)
    onDismissCallback?.(localText)
    onTextChangeCallback = null
    onDismissCallback = null
  }

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-base font-bold">{currentTitle || t('common.edit')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissPromptDetailSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={16} />
      </Pressable>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.85]}
      cornerRadius={30}
      grabber={Platform.OS === 'ios'}
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={handleDismiss}
      onDidPresent={() => setIsVisible(true)}>
      <View className="h-64" style={{ paddingBottom: insets.bottom + 10 }}>
        <YStack className="flex-1 gap-4 px-4 pb-4">
          <TextField className="flex-1 rounded-2xl">
            <TextField.Input
              className="h-64 flex-1 border-none p-4 text-base"
              placeholder={t('common.prompt')}
              value={localText}
              onChangeText={handleTextChange}
              multiline
              textAlignVertical="top"
              selectionColor="#2563eb"
              animation={{
                backgroundColor: {
                  value: {
                    blur: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    focus: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    error: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
                  }
                },
                borderColor: {
                  value: {
                    blur: 'transparent',
                    focus: 'transparent',
                    error: 'transparent'
                  }
                }
              }}
            />
          </TextField>
        </YStack>
      </View>
    </TrueSheet>
  )
}

PromptDetailSheet.displayName = 'PromptDetailSheet'

export default PromptDetailSheet
