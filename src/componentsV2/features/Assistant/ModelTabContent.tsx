import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { Button, Switch } from 'heroui-native'
import { MotiView } from 'moti'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { ReasoningSheet } from '@/componentsV2/features/Sheet/ReasoningSheet'
import { ChevronRight } from '@/componentsV2/icons/LucideIcon'
import Group from '@/componentsV2/layout/Group'
import Row from '@/componentsV2/layout/Row'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { isReasoningModel } from '@/config/models'
import { DEFAULT_CONTEXTCOUNT, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@/constants'
import type { Assistant, AssistantSettings, Model } from '@/types/assistant'
import { getBaseModelName } from '@/utils/naming'

import ModelSheet from '../Sheet/ModelSheet'

interface ModelTabContentProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export function ModelTabContent({ assistant, updateAssistant }: ModelTabContentProps) {
  const { t } = useTranslation()
  const modelSheetRef = useRef<BottomSheetModal>(null)
  const reasoningSheetRef = useRef<BottomSheetModal>(null)

  // Local state for input values
  const [temperatureInput, setTemperatureInput] = useState(
    (assistant.settings?.temperature ?? DEFAULT_TEMPERATURE).toString()
  )
  const [contextInput, setContextInput] = useState(
    (assistant.settings?.contextCount ?? DEFAULT_CONTEXTCOUNT).toString()
  )
  const [maxTokensInput, setMaxTokensInput] = useState((assistant.settings?.maxTokens ?? DEFAULT_MAX_TOKENS).toString())

  // 统一的助手更新函数
  const handleAssistantChange = async (updates: Partial<Assistant>) => {
    const updatedAssistant = { ...assistant, ...updates }
    await updateAssistant(updatedAssistant)
  }

  // 设置更新函数
  const handleSettingsChange = (key: keyof AssistantSettings, value: any) => {
    const updatedSettings = { ...assistant.settings, [key]: value }
    handleAssistantChange({ settings: updatedSettings })
  }

  // 模型更新函数
  const handleModelChange = async (models: Model[]) => {
    await handleAssistantChange({ defaultModel: models[0], model: models[0] })
  }

  const handleModelPress = () => {
    modelSheetRef.current?.present()
  }

  const handleReasoningPress = () => {
    reasoningSheetRef.current?.present()
  }

  const model = assistant?.defaultModel ? [assistant.defaultModel] : []
  const settings = assistant.settings || {}

  return (
    <MotiView
      style={{ flex: 1, gap: 16 }}
      from={{ opacity: 0, translateY: 10 }}
      animate={{
        translateY: 0,
        opacity: 1
      }}
      exit={{ opacity: 1, translateY: -10 }}
      transition={{
        type: 'timing'
      }}>
      <Button
        variant="tertiary"
        className="justify-between rounded-xl border-0 bg-ui-card-background dark:bg-ui-card-background-dark"
        onPress={handleModelPress}>
        {model.length > 0 ? (
          <XStack className="flex-1 flex-row items-center justify-between">
            <Text className="text-base" numberOfLines={1} ellipsizeMode="tail">
              {t(`provider.${model[0].provider}`)}
            </Text>
            <Text className="max-w-[70%] text-base" numberOfLines={1} ellipsizeMode="middle">
              {getBaseModelName(model[0].name)}
            </Text>
          </XStack>
        ) : (
          <Button.Label>
            <Text className="text-base" numberOfLines={1} ellipsizeMode="tail">
              {t('settings.models.empty.label')}
            </Text>
          </Button.Label>
        )}
        <ChevronRight size={14} />
      </Button>
      <Group>
        <Row>
          <Text>{t('assistants.settings.temperature')}</Text>
          <TextField className="min-w-[60px]">
            <TextField.Input
              value={temperatureInput}
              onChangeText={setTemperatureInput}
              onEndEditing={() => {
                const parsedValue = parseFloat(temperatureInput)

                if (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 1) {
                  handleSettingsChange('temperature', parsedValue)
                } else {
                  setTemperatureInput((settings.temperature ?? DEFAULT_TEMPERATURE).toString())
                }
              }}
              keyboardType="numeric"
            />
          </TextField>
        </Row>
        <Row>
          <Text>{t('assistants.settings.context')}</Text>
          <TextField className="min-w-[60px]">
            <TextField.Input
              value={contextInput}
              onChangeText={setContextInput}
              onEndEditing={() => {
                const parsedValue = parseInt(contextInput)

                if (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 30) {
                  handleSettingsChange('contextCount', parsedValue)
                } else {
                  setContextInput((settings.contextCount ?? DEFAULT_CONTEXTCOUNT).toString())
                }
              }}
              keyboardType="numeric"
            />
          </TextField>
        </Row>
      </Group>

      <Group>
        <Row>
          <Text>{t('assistants.settings.stream_output')}</Text>
          <Switch
            color="success"
            isSelected={settings.streamOutput ?? true}
            onSelectedChange={checked => handleSettingsChange('streamOutput', checked)}>
            <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
          </Switch>
        </Row>
        <Row>
          <Text>{t('assistants.settings.max_tokens')}</Text>
          <Switch
            color="success"
            isSelected={settings.enableMaxTokens ?? false}
            onSelectedChange={checked => handleSettingsChange('enableMaxTokens', checked)}>
            <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
          </Switch>
        </Row>
        {settings.enableMaxTokens && (
          <Row>
            <Text>{t('assistants.settings.max_tokens_value')}</Text>
            <TextField className="min-w-[60px]">
              <TextField.Input
                className="h-[25px] text-center text-xs leading-[14.4px]"
                value={maxTokensInput}
                onChangeText={setMaxTokensInput}
                onEndEditing={() => {
                  const parsedValue = parseInt(maxTokensInput)

                  if (!isNaN(parsedValue) && parsedValue > 0) {
                    handleSettingsChange('maxTokens', parsedValue)
                  } else {
                    setMaxTokensInput((settings.maxTokens ?? DEFAULT_MAX_TOKENS).toString())
                  }
                }}
                keyboardType="numeric"
              />
            </TextField>
          </Row>
        )}

        {isReasoningModel(model[0]) && (
          <Button
            variant="tertiary"
            className="justify-between rounded-xl border-0 bg-transparent py-3 pl-4 pr-5"
            onPress={handleReasoningPress}>
            <Button.Label className="flex-1 flex-row items-center justify-between">
              <XStack>
                <Text className="flex-1">{t('assistants.settings.reasoning.label')}</Text>

                <YStack className="justify-end">
                  <Text className="rounded-lg border-[0.5px] border-green-20 bg-green-10 px-2 py-[2px] text-sm text-green-100 dark:border-green-dark-20 dark:bg-green-dark-10 dark:text-green-dark-100">
                    {t(`assistants.settings.reasoning.${settings.reasoning_effort || 'off'}`)}
                  </Text>
                </YStack>
              </XStack>
            </Button.Label>
            <ChevronRight size={14} />
          </Button>
        )}
      </Group>
      <ModelSheet ref={modelSheetRef} mentions={model} setMentions={handleModelChange} multiple={false} />
      {model[0] && (
        <ReasoningSheet
          ref={reasoningSheetRef}
          model={model[0]}
          assistant={assistant}
          updateAssistant={handleAssistantChange}
        />
      )}
    </MotiView>
  )
}
