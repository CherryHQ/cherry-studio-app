import { MotiView } from 'moti'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Assistant } from '@/types/assistant'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import YStack from '@/componentsV2/layout/YStack'
import TextField from '@/componentsV2/base/TextField'

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
      <KeyboardAvoidingView className="flex-1">
        <YStack className="flex-1 gap-4">
          <TextField className="gap-2">
            <TextField.Label className="text-sm font-medium text-text-secondary dark:text-text-secondary">
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

          <TextField className="h-4/5 gap-2">
            <TextField.Label className="text-sm font-medium text-text-secondary dark:text-text-secondary">
              {t('common.prompt')}
            </TextField.Label>
            <TextField.Input
              className="flex-1 rounded-lg  px-3 py-3 text-sm"
              placeholder={t('common.prompt')}
              multiline
              numberOfLines={20}
              textAlignVertical="top"
              value={formData.prompt}
              onChangeText={prompt => setFormData(prev => ({ ...prev, prompt }))}
              onEndEditing={handleSave}
            />
          </TextField>
        </YStack>
      </KeyboardAvoidingView>
    </MotiView>
  )
}
