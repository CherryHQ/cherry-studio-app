import { MotiView } from 'moti'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import TextField from '@/componentsV2/base/TextField'
import { presentPromptDetailSheet } from '@/componentsV2/features/Sheet/PromptDetailSheet'
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
            <TextField.Input
              onPress={() => {
                presentPromptDetailSheet(
                  formData.prompt,
                  prompt => setFormData(prev => ({ ...prev, prompt })),
                  t('common.prompt'),
                  prompt => {
                    if (prompt !== assistant.prompt) {
                      updateAssistant({ ...assistant, prompt })
                    }
                  }
                )
              }}
              editable={false}
              className="flex-1 rounded-lg px-3 py-3 text-sm"
              placeholder={t('common.prompt')}
              multiline
              numberOfLines={20}
              textAlignVertical="top"
              value={formData.prompt}
            />
          </TextField>
        </YStack>
      </KeyboardAvoidingView>
    </MotiView>
  )
}
