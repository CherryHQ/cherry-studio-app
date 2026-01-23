import { BottomSheet, Button, Spinner  } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Pressable, View } from 'react-native'

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

const logger = loggerService.withContext('ProviderCheckSheet')

// Global state
let currentProvider: Provider | null = null
let onCheckCompleteCallback: ((status: ApiStatus) => void) | null = null
let updateProviderCallback: ((provider: Provider | null) => void) | null = null
let setIsOpenCallback: ((isOpen: boolean) => void) | null = null

export const presentProviderCheckSheet = (provider: Provider, onCheckComplete: (status: ApiStatus) => void) => {
  currentProvider = provider
  onCheckCompleteCallback = onCheckComplete
  updateProviderCallback?.(provider)
  setIsOpenCallback?.(true)
}

export const dismissProviderCheckSheet = () => setIsOpenCallback?.(false)

const ProviderCheckSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [provider, setProvider] = useState<Provider | null>(currentProvider)
  const [selectedModel, setSelectedModel] = useState<Model | undefined>()
  const [checkStatus, setCheckStatus] = useState<ApiStatus>('idle')

  
  useEffect(() => {
    updateProviderCallback = setProvider
    setIsOpenCallback = setIsOpen
    return () => {
      updateProviderCallback = null
      setIsOpenCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const backAction = () => {
      dismissProviderCheckSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isOpen])

  const handleDismiss = () => {
    setIsOpen(false)
    setSelectedModel(undefined)
    setCheckStatus('idle')
    onCheckCompleteCallback = null
  }

  const handleOpenChange = (value: boolean) => {
    setIsOpen(value)
    if (!value) {
      handleDismiss()
    }
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
      setIsOpen(false)
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

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange} isDismissKeyboardOnClose={true}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay isCloseOnPress={true} />
        <BottomSheet.Content style={{ backgroundColor: isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff' }}>
          <XStack className="border-foreground/10 items-center justify-between px-4 pb-4 pt-5">
            <Text className="text-foreground text-xl font-bold">{t('settings.provider.api_check.title')}</Text>
            <BottomSheet.Close asChild>
              <Pressable
                style={({ pressed }) => ({
                  padding: 4,
                  backgroundColor: isDark ? '#333333' : '#dddddd',
                  borderRadius: 16,
                  opacity: pressed ? 0.7 : 1
                })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={16} />
              </Pressable>
            </BottomSheet.Close>
          </XStack>

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
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  )
}

ProviderCheckSheet.displayName = 'ProviderCheckSheet'

export default ProviderCheckSheet
