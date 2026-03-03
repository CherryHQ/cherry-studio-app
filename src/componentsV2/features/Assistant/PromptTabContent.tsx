import { MotiView } from 'moti'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import { AvatarEditButton, Group, XStack } from '@/componentsV2'
import TextField from '@/componentsV2/base/TextField'
import { presentPromptDetailSheet } from '@/componentsV2/features/Sheet/PromptDetailSheet'
import { DefaultProviderIcon } from '@/componentsV2/icons'
import { ArrowLeftRight, Maximize2, PenLine } from '@/componentsV2/icons/LucideIcon'
import YStack from '@/componentsV2/layout/YStack'
import { loggerService } from '@/services/LoggerService'
import type { Assistant } from '@/types/assistant'
const logger = loggerService.withContext('AssistantDetailScreen')
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

  const updateAvatar = async (avatar: string) => {
    if (!assistant) return

    try {
      await updateAssistant({ ...assistant, emoji: avatar })
    } catch (error) {
      logger.error('Failed to update avatar', error)
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
      <KeyboardAvoidingView className="h-full flex-1 ">
        <YStack className="flex-1 gap-4">
          <Group className="flex flex-row p-3">
            {/* <View className="flex flex-row rounded-lg bg-white p-3"> */}
            <XStack className="mr-4 items-center justify-center  pb-5">
              <AvatarEditButton
                size={80}
                editButtonSize={28}
                content={assistant?.emoji || <DefaultProviderIcon />}
                editIcon={assistant?.emoji ? <ArrowLeftRight size={18} /> : <PenLine size={18} />}
                onEditPress={() => {}}
                updateAvatar={updateAvatar}
              />
            </XStack>

            <View className="flex-1">
              <TextField className="gap-2 ">
                <TextField.Label className="text-foreground-secondary text-sm font-medium">
                  {t('common.name')}
                </TextField.Label>

                <TextField.Input
                  className="border-border h-12 w-full rounded-lg border px-3 py-0 text-sm"
                  placeholder={t('assistants.name')}
                  value={formData.name}
                  onChangeText={name => setFormData(prev => ({ ...prev, name }))}
                  onEndEditing={handleSave}
                />
              </TextField>
            </View>
          </Group>
          <TextField className="flex-1 gap-2">
            <View className="flex flex-row items-center justify-between">
              <TextField.Label className="text-foreground-secondary  text-sm font-medium">
                {t('common.prompt')}
              </TextField.Label>
              <Pressable
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
                }}>
                <Maximize2 size={15} className="text-gray-500" />
              </Pressable>
            </View>

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
          </TextField>
        </YStack>
      </KeyboardAvoidingView>
    </MotiView>
  )
}
