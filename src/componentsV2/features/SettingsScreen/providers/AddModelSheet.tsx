import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Button } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Keyboard, TouchableWithoutFeedback, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import type { Model, Provider } from '@/types/assistant'
import { isIOS26 } from '@/utils/device'
import { getDefaultGroupName } from '@/utils/naming'

const logger = loggerService.withContext('AddModelSheet')

const SHEET_NAME = 'add-model-sheet'

// Global state for provider and updateProvider
let currentProvider: Provider | undefined
let currentUpdateProvider: ((updates: Partial<Omit<Provider, 'id'>>) => Promise<void>) | undefined
let updateProviderCallback: ((provider: Provider | undefined) => void) | null = null

export const presentAddModelSheet = (
  provider: Provider,
  updateProvider: (updates: Partial<Omit<Provider, 'id'>>) => Promise<void>
) => {
  currentProvider = provider
  currentUpdateProvider = updateProvider
  updateProviderCallback?.(provider)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissAddModelSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const AddModelSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()

  const [provider, setProvider] = useState<Provider | undefined>(currentProvider)
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [modelGroup, setModelGroup] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    updateProviderCallback = setProvider
    return () => {
      updateProviderCallback = null
    }
  }, [])

  useEffect(() => {
    setModelName(modelId)
    setModelGroup(getDefaultGroupName(modelId, provider?.id))
  }, [modelId, provider?.id])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissAddModelSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const resetForm = () => {
    setModelId('')
    setModelName('')
    setModelGroup('')
  }

  const handleAddModel = async () => {
    if (!provider || !currentUpdateProvider || !modelId.trim()) {
      logger.warn('Provider not available or Model ID is required.')
      return
    }

    if (provider.models.some(model => model.id === modelId.trim())) {
      logger.warn('Model ID already exists.', { modelId: modelId.trim() })
      return
    }

    const newModel: Model = {
      id: modelId,
      provider: provider.id,
      name: modelName,
      group: modelGroup
    }

    try {
      await currentUpdateProvider({ models: [...provider.models, newModel] })
      logger.info('Successfully added model:', newModel)
      dismissAddModelSheet()
    } catch (error) {
      logger.error('Failed to add model:', error)
    } finally {
      resetForm()
    }
  }

  const header = (
    <XStack className="w-full items-center justify-center pb-2 pt-5">
      <Text className="text-foreground text-xl">{t('settings.models.add.model.label')}</Text>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={['auto']}
      cornerRadius={30}
      grabber
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={() => {
        setIsVisible(false)
        resetForm()
      }}
      onDidPresent={() => setIsVisible(true)}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ paddingBottom: insets.bottom }}>
          <YStack className="items-center gap-6 px-5 pb-7">
            {/* Model ID Input */}
            <YStack className="w-full gap-2">
              <XStack className="gap-2 px-3">
                <Text className="text-foreground-secondary">{t('settings.models.add.model.id.label')}</Text>
                <Text className="text-red-500">*</Text>
              </XStack>
              <TextField className="rounded-2xl">
                <TextField.Input
                  className="h-11"
                  placeholder={t('settings.models.add.model.id.placeholder')}
                  value={modelId}
                  onChangeText={setModelId}
                />
              </TextField>
            </YStack>

            {/* Model Name Input */}
            <YStack className="w-full gap-2">
              <XStack className="gap-2 px-3">
                <Text className="text-foreground-secondary">{t('settings.models.add.model.name.label')}</Text>
              </XStack>
              <TextField className="rounded-2xl">
                <TextField.Input
                  className="h-11"
                  placeholder={t('settings.models.add.model.name.placeholder')}
                  value={modelName}
                  onChangeText={setModelName}
                />
              </TextField>
            </YStack>

            {/* Model Group Input */}
            <YStack className="w-full gap-2">
              <XStack className="gap-2 px-3">
                <Text className="text-foreground-secondary">{t('settings.models.add.model.group.label')}</Text>
              </XStack>
              <TextField className="rounded-2xl">
                <TextField.Input
                  className="h-11"
                  placeholder={t('settings.models.add.model.group.placeholder')}
                  value={modelGroup}
                  onChangeText={setModelGroup}
                />
              </TextField>
            </YStack>

            <Button
              pressableFeedbackVariant="ripple"
              variant="tertiary"
              className="primary-container h-11 w-4/6 rounded-2xl"
              onPress={handleAddModel}
              isDisabled={!modelId.trim()}>
              <Button.Label>
                <Text className="primary-text">{t('settings.models.add.model.label')}</Text>
              </Button.Label>
            </Button>
          </YStack>
        </View>
      </TouchableWithoutFeedback>
    </TrueSheet>
  )
}

AddModelSheet.displayName = 'AddModelSheet'
