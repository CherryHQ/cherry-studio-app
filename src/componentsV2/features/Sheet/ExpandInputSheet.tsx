import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { AnimatePresence, MotiView } from 'moti'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Keyboard, Platform, Pressable, TouchableWithoutFeedback, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { SendButton, VoiceButton } from '@/componentsV2/features/ChatScreen/MessageInput/buttons'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

const SHEET_NAME = 'expand-input-sheet'

// Global state
let currentText = ''
let currentHasFiles = false
let onTextChangeCallback: ((text: string) => void) | null = null
let onSendCallback: ((text?: string) => void) | null = null
let updateLocalTextCallback: ((text: string) => void) | null = null
let updateLocalHasFilesCallback: ((hasFiles: boolean) => void) | null = null

export const presentExpandInputSheet = (
  text: string,
  onChange: (text: string) => void,
  onSend: (text?: string) => void,
  hasFiles = false
) => {
  currentText = text
  currentHasFiles = hasFiles
  onTextChangeCallback = onChange
  onSendCallback = onSend
  updateLocalTextCallback?.(text)
  updateLocalHasFilesCallback?.(hasFiles)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissExpandInputSheet = () => TrueSheet.dismiss(SHEET_NAME)

const ExpandInputSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [isVisible, setIsVisible] = useState(false)
  const [localText, setLocalText] = useState(currentText)
  const [localHasFiles, setLocalHasFiles] = useState(currentHasFiles)
  const [isVoiceActive, setIsVoiceActive] = useState(false)

  useEffect(() => {
    updateLocalTextCallback = setLocalText
    updateLocalHasFilesCallback = setLocalHasFiles
    return () => {
      updateLocalTextCallback = null
      updateLocalHasFilesCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissExpandInputSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  // 实时同步文本到 MessageInput
  const handleTextChange = (text: string) => {
    setLocalText(text)
    onTextChangeCallback?.(text)
  }

  const handleSend = () => {
    const textToSend = localText
    dismissExpandInputSheet()
    requestAnimationFrame(() => {
      // Pass localText directly to bypass stale closure in sendMessage
      onSendCallback?.(textToSend)
    })
  }

  const handleDismiss = () => {
    setIsVisible(false)
    onTextChangeCallback = null
    onSendCallback = null
  }

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-base font-bold">{t('common.edit')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissExpandInputSheet}
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
                value={localText}
                onChangeText={handleTextChange}
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
              <AnimatePresence exitBeforeEnter>
                {isVoiceActive || (!localText.trim() && !localHasFiles) ? (
                  <MotiView
                    key="voice-button"
                    from={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: 'timing', duration: 200 }}>
                    <VoiceButton onTranscript={handleTextChange} onListeningChange={setIsVoiceActive} />
                  </MotiView>
                ) : (
                  <MotiView
                    key="send-button"
                    from={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: 'timing', duration: 200 }}>
                    <SendButton onSend={handleSend} />
                  </MotiView>
                )}
              </AnimatePresence>
            </XStack>
          </YStack>
        </View>
      </TouchableWithoutFeedback>
    </TrueSheet>
  )
}

ExpandInputSheet.displayName = 'ExpandInputSheet'

export default ExpandInputSheet
