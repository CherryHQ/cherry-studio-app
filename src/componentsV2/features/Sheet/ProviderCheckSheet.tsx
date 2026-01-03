import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Button, Spinner } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, View } from 'react-native'

import { presentDialog } from '@/componentsV2/base/Dialog'
import Text from '@/componentsV2/base/Text'
import { ModelSelect } from '@/componentsV2/features/SettingsScreen/providers/ModelSelect'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { checkApi } from '@/services/ApiService'
import { loggerService } from '@/services/LoggerService'
import type { ApiStatus, Model, Provider } from '@/types/assistant'
import { isIOS26 } from '@/utils/device'

const SHEET_NAME = 'provider-check-sheet'
const logger = loggerService.withContext('ProviderCheckSheet')

// Global state
let currentProvider: Provider | null = null
let onCheckCompleteCallback: ((status: ApiStatus) => void) | null = null
let updateProviderCallback: ((provider: Provider | null) => void) | null = null

export const presentProviderCheckSheet = (provider: Provider, onCheckComplete: (status: ApiStatus) => void) => {
  currentProvider = provider
  onCheckCompleteCallback = onCheckComplete
  updateProviderCallback?.(provider)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissProviderCheckSheet = () => TrueSheet.dismiss(SHEET_NAME)

const ProviderCheckSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const [provider, setProvider] = useState<Provider | null>(currentProvider)
  const [selectedModel, setSelectedModel] = useState<Model | undefined>()
  const [checkStatus, setCheckStatus] = useState<ApiStatus>('idle')

  useEffect(() => {
    updateProviderCallback = setProvider
    return () => {
      updateProviderCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissProviderCheckSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleDismiss = () => {
    setIsVisible(false)
    setSelectedModel(undefined)
    setCheckStatus('idle')
    onCheckCompleteCallback = null
  }

  const handleCheck = async () => {
    if (!provider || !selectedModel) {
      let errorKey = ''

      if (!selectedModel && !provider?.apiKey) {
        errorKey = 'model_api_key_empty'
      } else if (!selectedModel) {
        errorKey = 'model_empty'
      } else if (!provider?.apiKey) {
        errorKey = 'api_key_empty'
      }

      presentDialog('error', {
        title: t('settings.provider.check_failed.title'),
        content: t(`settings.provider.check_failed.${errorKey}`)
      })
      return
    }

    try {
      setCheckStatus('processing')
      await checkApi(provider, selectedModel)
      setCheckStatus('success')
      onCheckCompleteCallback?.('success')
      dismissProviderCheckSheet()
    } catch (error: any) {
      logger.error('Model check failed:', error)
      setCheckStatus('error')
      onCheckCompleteCallback?.('error')

      const errorMessage =
        error && error.message
          ? ' ' + (error.message.length > 100 ? error.message.substring(0, 100) + '...' : error.message)
          : ''

      presentDialog('error', {
        title: t('settings.provider.check_failed.title'),
        content: errorMessage
      })
    }
  }

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-xl font-bold">{t('settings.provider.api_check.title')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissProviderCheckSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={16} />
      </Pressable>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={['auto']}
      cornerRadius={30}
      grabber={Platform.OS === 'ios'}
      dismissible
      dimmed
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={handleDismiss}
      onDidPresent={() => setIsVisible(true)}>
      <View className="items-center justify-center px-4 pb-6">
        <YStack className="w-auto gap-4">
          {provider && <ModelSelect provider={provider} onSelectModel={setSelectedModel} />}
          <Button
            className="secondary-container rounded-xl border"
            pressableFeedbackVariant="ripple"
            onPress={handleCheck}
            isDisabled={checkStatus === 'processing'}>
            <Button.Label className="primary-text">
              {checkStatus === 'processing' ? <Spinner size="sm" /> : t('common.check')}
            </Button.Label>
          </Button>
        </YStack>
      </View>
    </TrueSheet>
  )
}

ProviderCheckSheet.displayName = 'ProviderCheckSheet'

export default ProviderCheckSheet
