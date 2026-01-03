import { Button, Switch } from 'heroui-native'
import { MotiView } from 'moti'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { presentReasoningSheet } from '@/componentsV2/features/Sheet/ReasoningSheet'
import { ChevronRight } from '@/componentsV2/icons/LucideIcon'
import Group from '@/componentsV2/layout/Group'
import Row from '@/componentsV2/layout/Row'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { isReasoningModel } from '@/config/models'
import { DEFAULT_CONTEXTCOUNT, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, MAX_CONTEXT_COUNT } from '@/constants'
import { useProvider } from '@/hooks/useProviders'
import type { Assistant, AssistantSettings, Model } from '@/types/assistant'
import { getBaseModelName } from '@/utils/naming'

import { presentModelSheet } from '../Sheet/ModelSheet'

interface ModelTabContentProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export function ModelTabContent({ assistant, updateAssistant }: ModelTabContentProps) {
  const { t } = useTranslation()

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
    presentModelSheet({
      mentions: model,
      setMentions: handleModelChange,
      multiple: false
    })
  }

  const handleReasoningPress = () => {
    if (!model[0]) return
    presentReasoningSheet({
      model: model[0],
      assistant,
      updateAssistant: handleAssistantChange
    })
  }

  const model = assistant?.defaultModel ? [assistant.defaultModel] : []
  const providerId = model[0]?.provider ?? ''
  const { provider } = useProvider(providerId)
  const providerDisplayName = providerId
    ? t(`provider.${providerId}`, { defaultValue: provider?.name ?? providerId })
    : (provider?.name ?? providerId)
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
        pressableFeedbackVariant="ripple"
        variant="tertiary"
        className="bg-card justify-between rounded-xl border-0"
        onPress={handleModelPress}>
        {model.length > 0 ? (
          <Button.Label className="min-w-0 flex-1">
            <XStack className="min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <Text className="min-w-0 flex-1 text-base" numberOfLines={1} ellipsizeMode="middle">
                {getBaseModelName(model[0].name)}
              </Text>
              <Text className="font-semibold opacity-45">|</Text>
              <Text className="min-w-0 text-base opacity-70" numberOfLines={1} ellipsizeMode="tail">
                {providerDisplayName}
              </Text>
            </XStack>
          </Button.Label>
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
              className="rounded-xl"
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
          <Text>{t('assistants.settings.unlimited_context')}</Text>
          <Switch
            isSelected={(settings.contextCount ?? DEFAULT_CONTEXTCOUNT) < MAX_CONTEXT_COUNT}
            onSelectedChange={checked => {
              if (checked) {
                // 启用限制 → 使用有限值
                handleSettingsChange('contextCount', DEFAULT_CONTEXTCOUNT)
                setContextInput(DEFAULT_CONTEXTCOUNT.toString())
              } else {
                // 关闭限制 → 无限
                handleSettingsChange('contextCount', MAX_CONTEXT_COUNT)
              }
            }}
          />
        </Row>
        {(settings.contextCount ?? DEFAULT_CONTEXTCOUNT) < MAX_CONTEXT_COUNT && (
          <Row>
            <Text>{t('assistants.settings.context')}</Text>
            <TextField className="min-w-[60px]">
              <TextField.Input
                className="rounded-xl"
                value={contextInput}
                onChangeText={setContextInput}
                onEndEditing={() => {
                  const parsedValue = parseInt(contextInput)

                  if (!isNaN(parsedValue) && parsedValue >= 0) {
                    // >= 100 自动设为无限
                    const finalValue = parsedValue >= MAX_CONTEXT_COUNT ? MAX_CONTEXT_COUNT : parsedValue
                    handleSettingsChange('contextCount', finalValue)
                    setContextInput(finalValue.toString())
                  } else {
                    setContextInput((settings.contextCount ?? DEFAULT_CONTEXTCOUNT).toString())
                  }
                }}
                keyboardType="numeric"
              />
            </TextField>
          </Row>
        )}
      </Group>

      <Group>
        <Row>
          <Text>{t('assistants.settings.stream_output')}</Text>
          <Switch
            isSelected={settings.streamOutput ?? true}
            onSelectedChange={checked => handleSettingsChange('streamOutput', checked)}></Switch>
        </Row>
        <Row>
          <Text>{t('assistants.settings.max_tokens')}</Text>
          <Switch
            isSelected={settings.enableMaxTokens ?? false}
            onSelectedChange={checked => handleSettingsChange('enableMaxTokens', checked)}></Switch>
        </Row>
        {settings.enableMaxTokens && (
          <Row>
            <Text>{t('assistants.settings.max_tokens_value')}</Text>
            <TextField className="min-w-24">
              <TextField.Input
                className="rounded-xl"
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
            pressableFeedbackVariant="ripple"
            variant="tertiary"
            className="justify-between rounded-xl border-0 bg-transparent py-3 pl-4 pr-5"
            onPress={handleReasoningPress}>
            <Button.Label className="flex-1 flex-row items-center justify-between">
              <XStack>
                <Text className="flex-1">{t('assistants.settings.reasoning.label')}</Text>

                <YStack className="justify-end">
                  <Text className="primary-badge rounded-lg border-[0.5px] px-2 py-0.5 text-sm">
                    {t(`assistants.settings.reasoning.${settings.reasoning_effort || 'off'}`)}
                  </Text>
                </YStack>
              </XStack>
            </Button.Label>
            <ChevronRight size={14} />
          </Button>
        )}
      </Group>
    </MotiView>
  )
}
