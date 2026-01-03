import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Button } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Keyboard, Platform, Pressable, TouchableWithoutFeedback, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

const SHEET_NAME = 'text-edit-sheet'

// Global state
let currentContent = ''
let onSaveCallback: ((content: string) => void) | null = null
let updateContentCallback: ((content: string) => void) | null = null

export const presentTextEditSheet = (content: string, onSave: (newContent: string) => void) => {
  currentContent = content
  onSaveCallback = onSave
  updateContentCallback?.(content)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissTextEditSheet = () => TrueSheet.dismiss(SHEET_NAME)

const TextEditSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
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
      dismissTextEditSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleSave = () => {
    onSaveCallback?.(content)
  }

  const handleDismiss = () => {
    setIsVisible(false)
    onSaveCallback = null
  }

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-base font-bold">{t('message.edit_reply')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissTextEditSheet}
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="h-72" style={{ paddingBottom: insets.bottom + 10 }}>
          <YStack className="flex-1 gap-4 px-4 pb-4">
            <TextField className="flex-1 rounded-2xl">
              <TextField.Input
                className="flex-1 border-none p-4 text-base"
                placeholder={t('inputs.placeholder')}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                autoFocus
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
            <XStack className="items-center justify-end">
              <Button
                size="sm"
                className="primary-container rounded-xl border"
                pressableFeedbackVariant="ripple"
                onPress={handleSave}>
                <Button.Label className="primary-text">{t('common.save')}</Button.Label>
              </Button>
            </XStack>
          </YStack>
        </View>
      </TouchableWithoutFeedback>
    </TrueSheet>
  )
}

TextEditSheet.displayName = 'TextEditSheet'

export default TextEditSheet
