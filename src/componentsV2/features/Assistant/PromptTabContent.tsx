import { MotiView } from 'moti'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Pressable, StyleSheet, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import TextField from '@/componentsV2/base/TextField'
import { ExpandButton } from '@/componentsV2/features/ChatScreen/MessageInput/ExpandButton'
import { presentExpandTextSheet } from '@/componentsV2/features/Sheet/ExpandTextSheet'
import { Save } from '@/componentsV2/icons'
import YStack from '@/componentsV2/layout/YStack'
import type { Assistant } from '@/types/assistant'

interface PromptTabContentProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => void
}

export function PromptTabContent({ assistant, updateAssistant }: PromptTabContentProps) {
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    name: assistant?.name || '',
    prompt: assistant?.prompt || ''
  })

  useEffect(() => {
    setFormData({
      name: assistant?.name || '',
      prompt: assistant?.prompt || ''
    })
  }, [assistant])

  const handleSave = () => {
    if (formData.name !== assistant.name || formData.prompt !== assistant.prompt) {
      updateAssistant({
        ...assistant,
        name: formData.name,
        prompt: formData.prompt
      })
    }
  }

  const handleSaveButtonPress = () => {
    Keyboard.dismiss()
    handleSave()
  }

  return (
    <MotiView
      style={{ flex: 1 }}
      from={{ opacity: 0, translateY: 10 }}
      animate={{
        translateY: 0,
        opacity: 1
      }}
      exit={{ opacity: 1, translateY: -10 }}
      transition={{
        type: 'timing'
      }}>
      <KeyboardAvoidingView className="h-full flex-1">
        <YStack className="flex-1 gap-4">
          <TextField className="gap-2">
            <TextField.Label className="text-foreground-secondary text-sm font-medium">
              {t('common.name')}
            </TextField.Label>
            <TextField.Input
              className="h-12 rounded-lg  px-3 py-0 text-sm"
              placeholder={t('assistants.name')}
              value={formData.name}
              onChangeText={name => setFormData(prev => ({ ...prev, name }))}
              onEndEditing={handleSave}
            />
          </TextField>

          <TextField className="flex-1 gap-2">
            <TextField.Label className="text-foreground-secondary text-sm font-medium">
              {t('common.prompt')}
            </TextField.Label>
            <View className="relative flex-1">
              <Pressable
                className="active:opacity-50"
                style={styles.saveButton}
                onPress={handleSaveButtonPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Save size={18} className="text-foreground/50" />
              </Pressable>
              <ExpandButton
                style={{ top: 8, right: 8 }}
                onPress={() => {
                  presentExpandTextSheet(
                    formData.prompt,
                    prompt => setFormData(prev => ({ ...prev, prompt })),
                    t('common.prompt')
                  )
                }}
              />
              <TextField.Input
                className="flex-1 rounded-lg px-3 py-3 text-sm"
                placeholder={t('common.prompt')}
                multiline
                numberOfLines={20}
                textAlignVertical="top"
                value={formData.prompt}
                onChangeText={prompt => setFormData(prev => ({ ...prev, prompt }))}
                onEndEditing={handleSave}
              />
            </View>
          </TextField>
        </YStack>
      </KeyboardAvoidingView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  saveButton: {
    position: 'absolute',
    right: 36,
    top: 8,
    padding: 4,
    zIndex: 10
  }
})
